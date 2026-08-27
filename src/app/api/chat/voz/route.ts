import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// La sala de voz de un canal.
//
// El servidor solo hace de portero y de cartero: dice quién está adentro y
// pasa los mensajes de negociación de un navegador a otro. El audio nunca lo
// toca — va directo entre las personas.
//
// Se consulta cada dos segundos en vez de abrir un WebSocket. Para diez
// personas eso alcanza, y evita montar un servidor aparte solo para esto.

/** Después de esto sin latido, se considera que la persona se fue. */
const VIVO_MS = 12_000;

/** Las señales viejas no le sirven a nadie: se limpian al leer. */
const SENAL_VIEJA_MS = 60_000;

async function canalDeLaOrg(channelId: string, organizationId: string) {
  const canal = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { id: true, organizationId: true },
  });
  return canal && canal.organizationId === organizationId ? canal : null;
}

/**
 * Latido y buzón: dice "sigo acá", devuelve quién más está y entrega las
 * señales dirigidas a esta persona.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { channelId, accion, muted, senales } = (await req.json()) as {
    channelId?: string;
    accion?: "entrar" | "latir" | "salir";
    muted?: boolean;
    senales?: { to: string; payload: unknown }[];
  };

  if (!channelId || !(await canalDeLaOrg(channelId, session.organizationId))) {
    return NextResponse.json({ error: "Ese canal no existe." }, { status: 404 });
  }

  if (accion === "salir") {
    await db.voicePresence.deleteMany({ where: { channelId, userId: session.userId } });
    // Las señales que le quedaron a medio camino ya no valen.
    await db.voiceSignal.deleteMany({
      where: { channelId, OR: [{ fromUserId: session.userId }, { toUserId: session.userId }] },
    });
    return NextResponse.json({ ok: true, participantes: [], recibidas: [] });
  }

  const ahora = new Date();

  await db.voicePresence.upsert({
    where: { channelId_userId: { channelId, userId: session.userId } },
    create: {
      channelId,
      userId: session.userId,
      muted: Boolean(muted),
      lastSeenAt: ahora,
    },
    update: { lastSeenAt: ahora, muted: Boolean(muted) },
  });

  // Las señales que este navegador quiere mandar. Se guardan de a lote para no
  // hacer un viaje por candidato de red, que son muchos y muy seguidos.
  const salida = (senales ?? []).filter((s) => s && s.to && s.payload);
  if (salida.length > 0) {
    await db.voiceSignal.createMany({
      data: salida.slice(0, 40).map((s) => ({
        channelId,
        fromUserId: session.userId,
        toUserId: s.to,
        payload: JSON.stringify(s.payload),
      })),
    });
  }

  // Se lee el buzón y se vacía en el mismo paso: una señal entregada dos veces
  // reabre una negociación que ya estaba cerrada.
  const recibidas = await db.voiceSignal.findMany({
    where: { channelId, toUserId: session.userId },
    orderBy: { createdAt: "asc" },
    take: 80,
    select: { id: true, fromUserId: true, payload: true },
  });
  if (recibidas.length > 0) {
    await db.voiceSignal.deleteMany({ where: { id: { in: recibidas.map((r) => r.id) } } });
  }

  // Fantasmas: quien dejó de latir se cae de la sala.
  const corte = new Date(ahora.getTime() - VIVO_MS);
  await db.voicePresence.deleteMany({ where: { channelId, lastSeenAt: { lt: corte } } });
  await db.voiceSignal.deleteMany({
    where: { channelId, createdAt: { lt: new Date(ahora.getTime() - SENAL_VIEJA_MS) } },
  });

  const participantes = await db.voicePresence.findMany({
    where: { channelId, lastSeenAt: { gte: corte } },
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      muted: true,
      joinedAt: true,
      user: { select: { name: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    ok: true,
    yo: session.userId,
    participantes: participantes.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      muted: p.muted,
      joinedAt: p.joinedAt.toISOString(),
    })),
    recibidas: recibidas.map((r) => ({
      from: r.fromUserId,
      payload: JSON.parse(r.payload) as unknown,
    })),
  });
}

/** Quiénes están en la sala, para poder mostrarlo sin entrar. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId || !(await canalDeLaOrg(channelId, session.organizationId))) {
    return NextResponse.json({ error: "Ese canal no existe." }, { status: 404 });
  }

  const corte = new Date(Date.now() - VIVO_MS);
  const participantes = await db.voicePresence.findMany({
    where: { channelId, lastSeenAt: { gte: corte } },
    orderBy: { joinedAt: "asc" },
    select: {
      userId: true,
      muted: true,
      user: { select: { name: true, avatarUrl: true } },
    },
  });

  return NextResponse.json({
    participantes: participantes.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      muted: p.muted,
    })),
  });
}
