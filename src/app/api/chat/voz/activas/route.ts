import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";

// Qué salas de voz están sonando ahora mismo, para la barra que se ve en toda
// la app.
//
// Existe aparte de /api/chat/voz porque esa ruta contesta sobre UN canal y
// solo le sirve a quien ya está adentro. Esta la consulta cualquier pantalla
// del panel para poder avisar "hay una llamada" sin obligar a nadie a pasar
// por el chat a mirar.

/** El mismo corte que usa la sala: sin latido reciente, la persona ya no está. */
const VIVO_MS = 12_000;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Quien no puede entrar al chat tampoco tiene por qué enterarse de que el
  // equipo está reunido: el aviso nombra el canal y quiénes están adentro.
  if (!canAccessPipeline(session.role)) return NextResponse.json({ salas: [] });

  const presencias = await db.voicePresence.findMany({
    where: {
      lastSeenAt: { gte: new Date(Date.now() - VIVO_MS) },
      channel: { organizationId: session.organizationId },
    },
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      channelId: true,
      channel: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  // Se agrupa acá y no con un groupBy porque además de contar hace falta el
  // nombre del canal, los nombres de quienes están y si yo soy uno de ellos:
  // con groupBy serían tres consultas para una lista que casi siempre tiene
  // una fila.
  const porCanal = new Map<
    string,
    { channelId: string; nombre: string; personas: string[]; yoEstoy: boolean }
  >();

  for (const p of presencias) {
    const sala = porCanal.get(p.channelId) ?? {
      channelId: p.channelId,
      nombre: p.channel.name,
      personas: [],
      yoEstoy: false,
    };
    sala.personas.push(p.user.name);
    if (p.userId === session.userId) sala.yoEstoy = true;
    porCanal.set(p.channelId, sala);
  }

  return NextResponse.json({ salas: [...porCanal.values()] });
}
