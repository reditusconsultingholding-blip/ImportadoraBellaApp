import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitesDePeriodos } from "@/lib/notificaciones-orden";
import { canManagePipeline } from "@/lib/permissions";
import { notificacionesVisibles, veLasCifras } from "@/lib/finanzas";
import NotificationCenter from "./notification-center";

// El período más largo de la pantalla es el mes, así que no tiene sentido
// traer más viejo que eso. El tope existe igual para no cargar mil filas en
// una semana de muchas alertas; cuando se llega, la pantalla lo dice en vez de
// recortar en silencio y mentir en el "de M".
const TOPE = 500;

export default async function NotificacionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Los cortes de día/semana/quincena/mes se calculan acá, una sola vez, y
  // viajan por props: si el cliente los recalculara en cada render, cruzar la
  // medianoche con la pestaña abierta movería los filtros solo.
  const limites = limitesDePeriodos();

  // El userId va en el WHERE siempre: una notificación es de una persona, no
  // de la organización.
  const delMes = { userId: session.userId, createdAt: { gte: new Date(limites.mes) } };

  const [verCifras, filasDelMes, totalCrudoDelMes, sinLeer] = await Promise.all([
    veLasCifras(session.userId),
    db.notification.findMany({ where: delMes, orderBy: { createdAt: "desc" }, take: TOPE }),
    db.notification.count({ where: delMes }),
    // La misma cuenta que hace la campanita —todas las sin leer, sin importar
    // la antigüedad—. Si cada una sacara su número por su lado, la campana
    // diría 7 y la pantalla 4.
    db.notification.findMany({
      where: { userId: session.userId, read: false },
      select: { message: true },
      take: TOPE,
    }),
  ]);

  // Las alertas del día viejas llevan el CPA y el punto de equilibrio dentro
  // del texto. Desde ahora se escriben según quién las va a recibir, pero las
  // que ya están guardadas no se pueden reescribir: se dejan de mostrar a
  // quien no ve cifras. Los totales se cuentan sobre lo mismo que se muestra,
  // para que el número del encabezado y la lista no se contradigan.
  const notificaciones = notificacionesVisibles(filasDelMes, verCifras);
  // Con el permiso, el total sigue saliendo de un count() y puede pasar el
  // tope: es lo que hace que la pantalla avise "hay 640 en el mes, se cargaron
  // las 500 más recientes". Sin el permiso se cuenta sobre lo que de verdad se
  // muestra, porque un total mayor que la lista se leería como filas perdidas.
  const totalDelMes = verCifras ? totalCrudoDelMes : notificaciones.length;
  const sinLeerTotal = notificacionesVisibles(sinLeer, verCifras).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Centro de notificaciones</h1>
        <p className="text-sm text-muted">
          Las alertas de Meta, TikTok y Shopify, las acciones por aprobar, los reportes y las menciones, ordenadas
          por lo que piden, por urgencia y por cuándo pasaron.
        </p>
      </div>
      <NotificationCenter
        initialNotifications={notificaciones.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
        limites={limites}
        totalDelMes={totalDelMes}
        sinLeerTotal={sinLeerTotal}
        // "Revisar alertas ahora" dispara el motor viejo de alertas, que
        // escribe avisos con el CPA y el gasto adentro. Sin el permiso de
        // finanzas ese botón generaría notificaciones que la propia pantalla
        // después esconde: mejor no ofrecerlo.
        canCheckAlerts={canManagePipeline(session.role) && verCifras}
      />
    </div>
  );
}
