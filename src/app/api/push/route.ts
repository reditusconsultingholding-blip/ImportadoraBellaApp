import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { avisarA, pushConfigurado } from "@/lib/push";

// Registro de dispositivos para notificaciones push.
//
// La clave pública se entrega acá y no se incrusta en el bundle: así rotarla no
// obliga a volver a desplegar la app.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const cuantos = await db.pushSubscription.count({ where: { userId: session.userId } });

  return NextResponse.json({
    disponible: pushConfigurado(),
    clavePublica: process.env.VAPID_PUBLIC_KEY?.trim() ?? null,
    dispositivos: cuantos,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { endpoint, keys, userAgent } = (await req.json()) as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Suscripción incompleta." }, { status: 400 });
  }

  // El endpoint es único por navegador: si ya estaba, se reasigna a esta
  // persona en vez de duplicar. Pasa cuando dos personas usan la misma
  // computadora.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
    update: {
      userId: session.userId,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent?.slice(0, 300) ?? null,
    },
  });

  // Un aviso de prueba en el momento: sin eso, quien activa las notificaciones
  // no tiene forma de saber si funcionaron hasta que pase algo importante — y
  // ahí ya es tarde para descubrir que no.
  await avisarA(session.userId, {
    titulo: "Listo, ya recibes avisos",
    cuerpo: "Te vamos a escribir cuando haya algo que decidir.",
    url: "/dashboard",
    etiqueta: "prueba",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (endpoint) {
    await db.pushSubscription.deleteMany({ where: { endpoint, userId: session.userId } });
  } else {
    // Sin endpoint se dan de baja todos los dispositivos de esta persona.
    await db.pushSubscription.deleteMany({ where: { userId: session.userId } });
  }

  return NextResponse.json({ ok: true });
}
