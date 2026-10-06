import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { db } from "@/lib/db";
import { mensajeSeguro } from "@/lib/respuesta";

/**
 * Dirección decide qué hacer con un choque entre Notion y Jarvis.
 *
 * Las opciones dependen del tipo, porque no todas tienen sentido en los dos:
 *
 * - "sobra_en_jarvis" (alguien puesto a mano que Notion no trae):
 *     dejar  → se queda, y no se vuelve a preguntar.
 *     quitar → se le saca el producto. Manda Notion.
 *
 * - "sin_cruzar" (Notion nombra a alguien que no existe en Jarvis):
 *     asignar → se le pone el producto a la persona que elijan, a mano.
 *     ignorar → se deja así y no se vuelve a preguntar por ese nombre.
 *
 * El choque se cierra con la decisión guardada, y la sincronización la lee en
 * cada pasada: contestar una vez alcanza. Si Notion cambia a otra persona, la
 * huella cambia y eso sí es una pregunta nueva.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Esto lo decide dirección." }, { status: 403 });
  }

  const { id } = await ctx.params;
  const { decision, userId } = (await req.json().catch(() => ({}))) as {
    decision?: string;
    userId?: string;
  };

  try {
    // El organizationId va en el WHERE y no se revisa después: un choque de
    // otra empresa no se encuentra, en vez de encontrarse y rechazarse.
    const conflicto = await db.conflictoResponsable.findFirst({
      where: { id, organizationId: session.organizationId },
    });
    if (!conflicto) return NextResponse.json({ error: "No existe ese conflicto." }, { status: 404 });
    if (conflicto.estado !== "pendiente") {
      // Varias personas de dirección reciben el mismo aviso: que dos abran la
      // pantalla a la vez es lo normal, no un error raro.
      return NextResponse.json(
        { error: "Alguien de dirección ya lo resolvió." },
        { status: 409 },
      );
    }

    const permitidas =
      conflicto.tipo === "sobra_en_jarvis" ? ["dejar", "quitar"] : ["asignar", "ignorar"];
    if (!decision || !permitidas.includes(decision)) {
      return NextResponse.json({ error: "Esa decisión no aplica acá." }, { status: 400 });
    }

    if (decision === "quitar" && conflicto.userId) {
      await db.responsableProducto.deleteMany({
        where: { productId: conflicto.productId, userId: conflicto.userId, origen: null },
      });
    }

    if (decision === "asignar") {
      if (!userId) {
        return NextResponse.json({ error: "Falta decir a quién." }, { status: 400 });
      }
      // Que la persona exista Y sea de esta empresa: el id viene del navegador.
      const destino = await db.user.findFirst({
        where: { id: userId, organizationId: session.organizationId },
        select: { id: true },
      });
      if (!destino) return NextResponse.json({ error: "Esa persona no existe." }, { status: 400 });

      // origen null a propósito: queda como asignación de dirección, así que la
      // sincronización no la va a tocar.
      await db.responsableProducto.createMany({
        data: [{ productId: conflicto.productId, userId: destino.id, origen: null }],
        skipDuplicates: true,
      });
    }

    await db.conflictoResponsable.update({
      where: { id },
      data: {
        estado: "resuelto",
        decision,
        decididoPorId: session.userId,
        decididoEn: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: mensajeSeguro(err, "No se pudo guardar la decisión.") },
      { status: 500 },
    );
  }
}
