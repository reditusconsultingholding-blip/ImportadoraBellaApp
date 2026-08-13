import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import NotificationCenter from "./notification-center";

export default async function NotificacionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notifications = await db.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Centro de notificaciones</h1>
        <p className="text-sm text-muted">
          Todas las alertas de Meta, TikTok y Shopify, menciones y reportes diarios en un solo lugar.
        </p>
      </div>
      <NotificationCenter
        initialNotifications={notifications.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
        canCheckAlerts={canManagePipeline(session.role)}
      />
    </div>
  );
}
