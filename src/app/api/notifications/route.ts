import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { notificacionesVisibles, veLasCifras } from "@/lib/finanzas";

// La campanita pide las últimas pocas; el centro de notificaciones pide la
// ventana completa del mes que ya cargó el server component. Sin `limite` el
// centro se quedaba con 30 filas después de "Revisar alertas ahora" y perdía
// de vista el resto del mes.
const LIMITE_POR_DEFECTO = 30;
const LIMITE_MAXIMO = 500;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const params = new URL(req.url).searchParams;

  const pedido = Number(params.get("limite"));
  const take = Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, LIMITE_MAXIMO) : LIMITE_POR_DEFECTO;

  // Una fecha inválida no recorta nada en vez de reventar la consulta.
  const desde = params.get("desde");
  const corte = desde ? new Date(desde) : null;
  const createdAt = corte && !Number.isNaN(corte.getTime()) ? { gte: corte } : undefined;

  const verCifras = await veLasCifras(session.userId);

  // El userId sale de la sesión, nunca de la query: cada quien ve las suyas.
  const filas = await db.notification.findMany({
    where: { userId: session.userId, createdAt },
    orderBy: { createdAt: "desc" },
    take,
  });
  const notifications = notificacionesVisibles(filas, verCifras);

  // Sin recorte de fecha ni de tipo: es el número que pinta la campanita y
  // tiene que ser el mismo que muestra el centro de notificaciones.
  //
  // Cuando hay que esconder las que llevan montos, ese número no puede salir
  // de un count(): diría 7 y la lista mostraría 4, que es exactamente la
  // sensación de app rota que se quiere evitar. Se traen los mensajes sin leer
  // y se cuentan los que quedan — son pocos por definición, es la bandeja que
  // la persona todavía no vació.
  const unreadCount = verCifras
    ? await db.notification.count({ where: { userId: session.userId, read: false } })
    : notificacionesVisibles(
        await db.notification.findMany({
          where: { userId: session.userId, read: false },
          select: { message: true },
          take: LIMITE_MAXIMO,
        }),
        false
      ).length;

  return NextResponse.json({ notifications, unreadCount });
}
