import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * Marca la capacitación de quien está entrando.
 *
 * Cada quien solo puede tocar la suya: el id sale de la sesión y no del
 * cuerpo del pedido. Reiniciarle el recorrido a otra persona es otra cosa y
 * vive en `/api/capacitacion/reiniciar`, con la verificación de dueño.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { vista } = (await req.json().catch(() => ({}))) as { vista?: unknown };
  if (typeof vista !== "boolean") {
    return NextResponse.json({ error: "Falta indicar si la vio." }, { status: 400 });
  }

  await db.user.update({
    where: { id: session.userId },
    data: { capacitacionVista: vista },
  });

  return NextResponse.json({ capacitacionVista: vista });
}
