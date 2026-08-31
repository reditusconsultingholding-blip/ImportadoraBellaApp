import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * Le vuelve a mandar el recorrido a alguien del equipo.
 *
 * Es la razón por la que `capacitacionVista` vive en la base y no en el
 * navegador de cada uno: si cambia una pantalla, el dueño necesita poder
 * volver a capacitar sin pedirle a nadie que borre nada.
 *
 * El rol se comprueba acá y no solo escondiendo el botón: la pantalla de
 * Usuarios oculta la sección, pero esta ruta es un POST que cualquiera con
 * sesión podría llamar a mano.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (session.role !== "OWNER") {
    return NextResponse.json(
      { error: "Solo un administrador puede reiniciar la capacitación." },
      { status: 403 }
    );
  }

  const { userId, todos } = (await req.json().catch(() => ({}))) as {
    userId?: unknown;
    todos?: unknown;
  };

  // El filtro de organización va en las dos ramas. Sin él, un id de otra
  // empresa entraría por el `where` y se reiniciaría una capacitación ajena.
  if (todos === true) {
    const { count } = await db.user.updateMany({
      // Sin el filtro por vista tambien alcanza a quien nunca la termino pero
      // ya gasto sus tres aperturas: a esa persona reiniciar tiene que
      // servirle igual.
      where: { organizationId: session.organizationId },
      // Las aperturas vuelven a cero: si no, reiniciarle el recorrido a quien
      // ya lo vio tres veces no se lo abriria nunca y el boton pareceria roto.
      data: { capacitacionVista: false, capacitacionAperturas: 0 },
    });
    return NextResponse.json({ reiniciados: count });
  }

  if (typeof userId !== "string" || !userId) {
    return NextResponse.json({ error: "Falta a quién reiniciarle la capacitación." }, { status: 400 });
  }

  const { count } = await db.user.updateMany({
    where: { id: userId, organizationId: session.organizationId },
    data: { capacitacionVista: false, capacitacionAperturas: 0 },
  });
  if (count === 0) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ reiniciados: count });
}
