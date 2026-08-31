import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { limitesDePeriodos } from "@/lib/notificaciones-orden";
import { canManagePipeline } from "@/lib/permissions";
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

  const [notificaciones, totalDelMes, sinLeerTotal] = await Promise.all([
    db.notification.findMany({ where: delMes, orderBy: { createdAt: "desc" }, take: TOPE }),
    db.notification.count({ where: delMes }),
    // La misma cuenta que hace la campanita —todas las sin leer, sin importar
    // la antigüedad—. Si cada una sacara su número por su lado, la campana
    // diría 7 y la pantalla 4.
    db.notification.count({ where: { userId: session.userId, read: false } }),
  ]);

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
        canCheckAlerts={canManagePipeline(session.role)}
      />
    </div>
  );
}
