"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Notification = {
  id: string;
  message: string;
  link: string | null;
  type: string;
  read: boolean;
  createdAt: string;
};

const TYPE_META: Record<string, { label: string; badge: string }> = {
  mention: { label: "Mención", badge: "bg-surface-2 text-foreground" },
  alert_escala: { label: "Oportunidad de escalar", badge: "bg-good-bg text-good" },
  alert_fatiga: { label: "Fatiga de anuncio", badge: "bg-critical-bg text-critical" },
  alert_discrepancia: { label: "Discrepancia de datos", badge: "bg-critical-bg text-critical" },
  daily_report: { label: "Reporte diario", badge: "bg-accent/15 text-accent" },
};

const FILTERS = [
  { key: "all", label: "Todas" },
  { key: "alert_escala", label: "Escalar" },
  { key: "alert_fatiga", label: "Fatiga" },
  { key: "alert_discrepancia", label: "Discrepancias" },
  { key: "daily_report", label: "Reportes" },
  { key: "mention", label: "Menciones" },
];

export default function NotificationCenter({
  initialNotifications,
  canCheckAlerts,
}: {
  initialNotifications: Notification[];
  canCheckAlerts: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialNotifications);
  const [filter, setFilter] = useState("all");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((n) => n.type === filter)),
    [items, filter]
  );
  const unreadCount = items.filter((n) => !n.read).length;

  async function markRead(n: Notification) {
    if (n.read) return;
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
  }

  async function checkAlertsNow() {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/alerts/check", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCheckResult(data.error ?? "No se pudo revisar alertas.");
        return;
      }
      const { escala, fatiga, discrepancia } = data.summary ?? {};
      const total = (escala ?? 0) + (fatiga ?? 0) + (discrepancia ?? 0);
      setCheckResult(total > 0 ? `Se generaron ${total} alertas nuevas.` : "Todo revisado — nada nuevo por ahora.");
      router.refresh();
      const r = await fetch("/api/notifications");
      if (r.ok) {
        const d = await r.json();
        setItems(d.notifications);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs font-mono uppercase tracking-wide px-3 py-1.5 rounded ${
                filter === f.key ? "bg-accent text-white" : "bg-surface-2 text-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {canCheckAlerts && (
            <button
              onClick={checkAlertsNow}
              disabled={checking}
              className="text-xs font-medium px-3 py-1.5 rounded border border-border hover:bg-surface-2 transition disabled:opacity-60"
            >
              {checking ? "Revisando…" : "Revisar alertas ahora"}
            </button>
          )}
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-xs text-accent hover:underline">
              Marcar todo leído ({unreadCount})
            </button>
          )}
        </div>
      </div>

      {checkResult && <p className="text-xs text-muted">{checkResult}</p>}

      <div className="bg-surface border border-border rounded overflow-hidden">
        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No hay notificaciones acá todavía.</p>
        ) : (
          filtered.map((n) => {
            const meta = TYPE_META[n.type] ?? { label: n.type, badge: "bg-surface-2 text-foreground" };
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-5 py-4 border-b border-border last:border-b-0 ${
                  n.read ? "" : "bg-accent/5"
                }`}
              >
                <span className={`shrink-0 font-mono text-[10px] uppercase tracking-wide px-2 py-1 rounded ${meta.badge}`}>
                  {meta.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{n.message}</p>
                  <p className="text-[11px] text-muted mt-1 font-mono">
                    {new Date(n.createdAt).toLocaleString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {n.link && (
                    <a href={n.link} onClick={() => markRead(n)} className="text-xs text-accent hover:underline">
                      Ver
                    </a>
                  )}
                  {!n.read && (
                    <button onClick={() => markRead(n)} className="text-xs text-muted hover:text-foreground">
                      Marcar leído
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
