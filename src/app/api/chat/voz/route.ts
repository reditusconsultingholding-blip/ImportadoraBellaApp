import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

// La sala de voz de un canal.
//
// El servidor solo hace de portero y de cartero: dice quién está adentro y
// pasa los mensajes de negociación de un navegador a otro. El audio nunca lo
// toca — va directo entre las personas.
//
// Se consulta cada dos segundos en vez de abrir un WebSocket. Para diez
// personas eso alcanza, y evita montar un servidor aparte solo para esto.
//
// Acá también se deciden tres cosas que NO pueden quedar en el navegador,
// porque cualquiera puede editar lo que su navegador manda:
//
//   - quién puede silenciar a otro (dirección, y solo dentro de la sala),
//   - que el silenciado no pueda deshacerlo con su propio botón,
//   - cuántas cámaras se permiten prendidas a la vez.

/** Después de esto sin latido, se considera que la persona se fue. */
const VIVO_MS = 12_000;

/** Las señales viejas no le sirven a nadie: se limpian al leer. */
const SENAL_VIEJA_MS = 60_000;

/**
 * Cuántas cámaras se permiten prendidas a la vez en una sala.
 *
 * Cuatro, y no es un número decorativo: la sala es una MALLA. Quien prende la
 * cámara no manda un video, manda uno por cada otra persona de la sala, y lo
 * codifica una vez por destino. Con la captura limitada a 640×360 (~500 kbps),
 * cuatro cámaras en una sala de ocho significan que cada una de esas cuatro
 * personas sube unos 3,5 Mbps y todas bajan unos 2 Mbps. Eso ya está en el
 * techo de una conexión doméstica de Guayaquil y de una laptop sin codificador
 * por hardware.
 *
 * Pasado ese punto la sala no se degrada de a poco: se corta también el audio,
 * que es lo que vino a resolver. Por eso el tope se aplica acá y no escondiendo
 * el botón — quien sube de más rompe la reunión de los demás, no la suya.
 *
 * El día que haya un servidor de medios que reciba una copia y la reparta,
 * este límite deja de tener sentido y se borra.
 *
 * No se exporta: un `route.ts` solo puede exportar sus verbos, cualquier otra
 * cosa hace fallar el build. El número viaja al navegador en la respuesta del
 * latido (`maxCamaras`), que además es lo correcto — el tope de verdad es el
 * del servidor.
 */
const MAX_CAMARAS = 4;

async function canalDeLaOrg(channelId: string, organizationId: string) {
  const canal = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { id: true, organizationId: true },
  });
  return canal && canal.organizationId === organizationId ? canal : null;
}

/** Una fila de presencia tal como la lee esta ruta. */
type FilaPresencia = {
  userId: string;
  muted: boolean;
  camara: boolean;
  manoLevantadaAt: Date | null;
  silenciadoEnAt: Date | null;
  joinedAt: Date;
  user: { name: string; avatarUrl: string | null };
  silenciadoPor: { id: string; name: string } | null;
};

const SELECT_PRESENCIA = {
  userId: true,
  muted: true,
  camara: true,
  manoLevantadaAt: true,
  silenciadoEnAt: true,
  joinedAt: true,
  user: { select: { name: true, avatarUrl: true } },
  silenciadoPor: { select: { id: true, name: true } },
};

/**
 * El orden de la lista de la sala.
 *
 * Primero las manos levantadas, por orden de quién la levantó ANTES. Ese orden
 * es el motivo de que la mano exista: si la lista se ordenara por nombre o por
 * quién entró primero, levantarla no diría a quién le toca hablar y volveríamos
 * a que hable el que pisa más fuerte. Detrás, el resto por orden de llegada.
 *
 * Se ordena acá y no con un `orderBy` de Prisma porque el criterio mezcla una
 * columna que puede ser nula con otra que no, y dónde caen los nulos depende
 * del motor: en una lista de seis filas no vale la pena esa dependencia.
 */
function ordenarSala<T extends { manoLevantadaAt: Date | null; joinedAt: Date }>(filas: T[]): T[] {
  return [...filas].sort((a, b) => {
    if (a.manoLevantadaAt && b.manoLevantadaAt) {
      return a.manoLevantadaAt.getTime() - b.manoLevantadaAt.getTime();
    }
    if (a.manoLevantadaAt) return -1;
    if (b.manoLevantadaAt) return 1;
    return a.joinedAt.getTime() - b.joinedAt.getTime();
  });
}

function aVista(p: FilaPresencia) {
  return {
    userId: p.userId,
    name: p.user.name,
    avatarUrl: p.user.avatarUrl,
    muted: p.muted,
    camara: p.camara,
    manoLevantadaAt: p.manoLevantadaAt ? p.manoLevantadaAt.toISOString() : null,
    silenciadoPor: p.silenciadoPor,
    silenciadoEnAt: p.silenciadoEnAt ? p.silenciadoEnAt.toISOString() : null,
    joinedAt: p.joinedAt.toISOString(),
  };
}

/** Quiénes siguen vivos en la sala, ya ordenados. */
async function salaDe(channelId: string, corte: Date) {
  const filas = await db.voicePresence.findMany({
    where: { channelId, lastSeenAt: { gte: corte } },
    select: SELECT_PRESENCIA,
  });
  return ordenarSala(filas).map(aVista);
}

/**
 * Silenciar (o devolverle el micrófono) a alguien de la sala.
 *
 * Va por el servidor y no como una señal de un navegador a otro a propósito:
 * si la orden viajara directo, el navegador silenciado sería el que decide
 * obedecerla. Acá queda escrita en la fila de esa persona y el latido se la
 * impone.
 *
 * Hasta dónde llega, dicho sin adornos: el audio es punto a punto, así que un
 * navegador reescrito podría seguir mandando su pista aunque la app le diga
 * que está silenciado. Con un servidor de medios se cortaría de verdad; sin
 * él, esto frena a la app, no a quien la reescriba.
 */
async function ordenDeSilencio(
  session: {
    userId: string;
    role: "OWNER" | "DIRECTOR" | "EDITOR" | "PENDING";
    organizationId: string;
  },
  channelId: string,
  targetId: string | undefined,
  silenciar: boolean
) {
  if (!canManagePipeline(session.role)) {
    return NextResponse.json(
      { error: "Solo dirección puede silenciar a alguien en la sala." },
      { status: 403 }
    );
  }
  if (!targetId) {
    return NextResponse.json({ error: "Falta a quién silenciar." }, { status: 400 });
  }
  if (targetId === session.userId) {
    return NextResponse.json(
      { error: "Para silenciarte a ti mismo usa el botón del micrófono." },
      { status: 400 }
    );
  }

  const objetivo = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, organizationId: true },
  });
  if (!objetivo || objetivo.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Esa persona no está en la sala." }, { status: 404 });
  }
  // Un director no le tapa el micrófono al dueño. Sin esta línea el permiso de
  // silenciar alcanzaría para dejar callado a quien está por encima de quien
  // lo usa.
  if (objetivo.role === "OWNER" && session.role !== "OWNER") {
    return NextResponse.json({ error: `No puedes silenciar a ${objetivo.name}.` }, { status: 403 });
  }

  const cambiadas = await db.voicePresence.updateMany({
    where: { channelId, userId: targetId },
    data: silenciar
      ? { muted: true, silenciadoPorId: session.userId, silenciadoEnAt: new Date() }
      : { muted: false, silenciadoPorId: null, silenciadoEnAt: null },
  });
  if (cambiadas.count === 0) {
    return NextResponse.json({ error: `${objetivo.name} ya no está en la sala.` }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    participantes: await salaDe(channelId, new Date(Date.now() - VIVO_MS)),
  });
}

/**
 * Latido y buzón: dice "sigo aquí", devuelve quién más está y entrega las
 * señales dirigidas a esta persona.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { channelId, accion, muted, camara, mano, targetId, senales } = (await req.json()) as {
    channelId?: string;
    accion?: "entrar" | "latir" | "salir" | "silenciar" | "quitar-silencio";
    muted?: boolean;
    camara?: boolean;
    mano?: boolean;
    targetId?: string;
    senales?: { to: string; payload: unknown }[];
  };

  if (!channelId || !(await canalDeLaOrg(channelId, session.organizationId))) {
    return NextResponse.json({ error: "Ese canal no existe." }, { status: 404 });
  }

  if (accion === "silenciar" || accion === "quitar-silencio") {
    return ordenDeSilencio(session, channelId, targetId, accion === "silenciar");
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
  const corte = new Date(ahora.getTime() - VIVO_MS);

  const mia = await db.voicePresence.findUnique({
    where: { channelId_userId: { channelId, userId: session.userId } },
    select: { manoLevantadaAt: true, silenciadoPorId: true, camara: true },
  });

  // Un silencio puesto por dirección le gana al botón del navegador. Si no, el
  // silenciado se lo saca solo en el siguiente latido y la orden dura dos
  // segundos.
  const mudoFinal = mia?.silenciadoPorId ? true : Boolean(muted);

  // La mano conserva el instante en que se levantó. Si se pisara en cada
  // latido, la persona volvería al final de la fila cada dos segundos y el
  // turno no significaría nada.
  const manoFinal = mano ? (mia?.manoLevantadaAt ?? ahora) : null;

  // El tope de cámaras se cuenta contra las que YA están prendidas, sin
  // contarse a sí misma: quien la tiene encendida no se echa afuera al latir.
  // Queda una ventana chica —dos personas prendiendo en el mismo instante
  // pueden dejar cinco— porque contar y escribir no son un solo paso; se
  // corrige sola en cuanto una apaga, y una cámara de más cuesta bastante
  // menos que serializar una consulta que corre cada dos segundos.
  let camaraFinal = Boolean(camara);
  let camaraRechazada = false;
  if (camaraFinal && !mia?.camara) {
    const prendidas = await db.voicePresence.count({
      where: {
        channelId,
        camara: true,
        lastSeenAt: { gte: corte },
        userId: { not: session.userId },
      },
    });
    if (prendidas >= MAX_CAMARAS) {
      camaraFinal = false;
      camaraRechazada = true;
    }
  }

  await db.voicePresence.upsert({
    where: { channelId_userId: { channelId, userId: session.userId } },
    create: {
      channelId,
      userId: session.userId,
      muted: mudoFinal,
      camara: camaraFinal,
      manoLevantadaAt: manoFinal,
      lastSeenAt: ahora,
    },
    update: {
      lastSeenAt: ahora,
      muted: mudoFinal,
      camara: camaraFinal,
      manoLevantadaAt: manoFinal,
    },
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

  // Fantasmas: quien dejó de latir se cae de la sala. Se lleva su silencio con
  // él, y eso es a propósito: el silencio dura lo que dura el paso por la sala,
  // así que nadie queda mudo para siempre porque quien lo silenció cerró la
  // pestaña antes de devolverle el micrófono.
  await db.voicePresence.deleteMany({ where: { channelId, lastSeenAt: { lt: corte } } });
  await db.voiceSignal.deleteMany({
    where: { channelId, createdAt: { lt: new Date(ahora.getTime() - SENAL_VIEJA_MS) } },
  });

  return NextResponse.json({
    ok: true,
    yo: session.userId,
    maxCamaras: MAX_CAMARAS,
    camaraRechazada,
    puedeSilenciar: canManagePipeline(session.role),
    participantes: await salaDe(channelId, corte),
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

  return NextResponse.json({
    maxCamaras: MAX_CAMARAS,
    puedeSilenciar: canManagePipeline(session.role),
    participantes: await salaDe(channelId, new Date(Date.now() - VIVO_MS)),
  });
}
