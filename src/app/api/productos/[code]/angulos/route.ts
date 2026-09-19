import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { puedeCrearEn } from "@/lib/responsables";
import { ANGLES } from "@/lib/pipeline-options";

// Agregar un ángulo propio a un producto.
//
// La lista de Super Ads tiene treinta ángulos generales, pero cada producto
// tiene los suyos, y obligar a elegir "el más parecido" hace que el campo deje
// de decir algo. Lo agregan los responsables del producto —que son quienes lo
// trabajan— y dirección. Queda disponible para todas las piezas del producto.

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { code } = await params;
  const producto = await db.product.findFirst({
    where: { code: decodeURIComponent(code), organizationId: session.organizationId },
    select: { id: true, angulosPropios: true },
  });
  if (!producto) return NextResponse.json({ error: "Producto no encontrado." }, { status: 404 });
  if (!(await puedeCrearEn(session, producto.id))) {
    return NextResponse.json(
      { error: "Solo los responsables del producto pueden agregarle ángulos." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as { angulo?: string };
  const angulo = body.angulo?.replace(/\s+/g, " ").trim() ?? "";
  if (angulo.length < 3 || angulo.length > 60) {
    return NextResponse.json({ error: "El ángulo tiene que tener entre 3 y 60 letras." }, { status: 400 });
  }

  // Sin duplicados, tampoco contra la lista general: si ya existe con otras
  // mayúsculas, se usa el que existe.
  const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const existente = [...ANGLES, ...producto.angulosPropios].find((a) => clave(a) === clave(angulo));
  if (existente) return NextResponse.json({ angulo: existente, angulosPropios: producto.angulosPropios });

  const actualizado = await db.product.update({
    where: { id: producto.id },
    data: { angulosPropios: { push: angulo } },
    select: { angulosPropios: true },
  });
  return NextResponse.json({ angulo, angulosPropios: actualizado.angulosPropios });
}
