import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Lo anclado de un canal: hasta 3 notas o links que el equipo quiere tener a
// mano. El tope está acá y no solo en la pantalla, porque un tope que solo
// vive en el botón no es un tope.
const MAXIMO = 3;

// Solo http y https. Un pin con "javascript:" sería un click ejecutando código
// en la sesión de otro.
function urlValida(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Confirma que el canal existe y es de la organización de quien pregunta. */
async function canalDeLaOrg(channelId: string, organizationId: string) {
  const canal = await db.chatChannel.findUnique({
    where: { id: channelId },
    select: { id: true, organizationId: true },
  });
  return canal && canal.organizationId === organizationId ? canal : null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const channelId = req.nextUrl.searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "Falta el canal." }, { status: 400 });
  if (!(await canalDeLaOrg(channelId, session.organizationId))) {
    return NextResponse.json({ error: "Ese canal no existe." }, { status: 404 });
  }

  const pins = await db.chatPin.findMany({
    where: { channelId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      url: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ pins });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { channelId, kind, title, body, url } = (await req.json()) as {
    channelId?: string;
    kind?: string;
    title?: string;
    body?: string;
    url?: string;
  };

  if (!channelId || !(await canalDeLaOrg(channelId, session.organizationId))) {
    return NextResponse.json({ error: "Ese canal no existe." }, { status: 404 });
  }

  const tipo = kind === "LINK" ? "LINK" : "NOTA";
  const titulo = title?.trim();
  if (!titulo) return NextResponse.json({ error: "Ponele un título." }, { status: 400 });

  const destino = url?.trim();
  if (tipo === "LINK") {
    if (!destino) return NextResponse.json({ error: "Falta el link." }, { status: 400 });
    if (!urlValida(destino)) {
      return NextResponse.json(
        { error: "El link tiene que empezar con http:// o https://." },
        { status: 400 }
      );
    }
  }

  const cuantos = await db.chatPin.count({ where: { channelId } });
  if (cuantos >= MAXIMO) {
    return NextResponse.json(
      { error: `Este canal ya tiene ${MAXIMO} anclados. Soltá uno para anclar otro.` },
      { status: 409 }
    );
  }

  const pin = await db.chatPin.create({
    data: {
      channelId,
      kind: tipo,
      title: titulo.slice(0, 120),
      body: tipo === "NOTA" ? (body?.trim().slice(0, 2000) || null) : null,
      url: tipo === "LINK" ? destino : null,
      createdById: session.userId,
    },
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      url: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ ok: true, pin });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el anclado." }, { status: 400 });

  const pin = await db.chatPin.findUnique({
    where: { id },
    select: { id: true, createdById: true, channel: { select: { organizationId: true } } },
  });
  if (!pin || pin.channel.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Ese anclado no existe." }, { status: 404 });
  }

  // Lo suelta quien lo ancló o alguien de dirección: si solo pudiera el autor,
  // un pin de alguien que se fue del equipo quedaría trabado para siempre.
  const puede = pin.createdById === session.userId || session.role === "OWNER";
  if (!puede) {
    return NextResponse.json({ error: "Ese anclado no es tuyo." }, { status: 403 });
  }

  await db.chatPin.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
