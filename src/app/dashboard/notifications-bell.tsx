"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type Notification = { id: string; message: string; link: string | null; read: boolean; createdAt: string };

export default function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // El estado se toca dentro del .then y no en el cuerpo del efecto: hacerlo
  // sincrónicamente ahí dispara un render de más y no resiste el modo estricto
  // de React.
  const load = useCallback(() => {
    fetch("/api/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setItems(data.notifications);
        setUnreadCount(data.unreadCount);
      })
      .catch(() => {
        // Una caída puntual de red no tiene que romper la campana; en 30
        // segundos se vuelve a intentar.
      });
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function openNotification(n: Notification) {
    if (!n.read) {
      await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        className="relative text-muted hover:text-foreground transition p-1.5"
        aria-label="Notificaciones"
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none">
          <path
            d="M15 7a5 5 0 0 0-10 0c0 4.5-2 5.5-2 5.5h14s-2-1-2-5.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 15.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-critical text-white text-[10px] font-mono rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-surface border border-border rounded shadow-lg z-20 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-mono text-xs uppercase tracking-wide text-muted">Notificaciones</p>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-accent hover:underline">
                Marcar todo leído
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted text-center">No hay notificaciones.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full text-left px-4 py-3 border-b border-border last:border-b-0 hover:bg-surface-2 transition ${
                  n.read ? "" : "bg-accent/5"
                }`}
              >
                <p className="text-xs">{n.message}</p>
                <p className="text-[10px] text-muted mt-1 font-mono">
                  {new Date(n.createdAt).toLocaleString("es-CO", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </button>
            ))
          )}
          <a
            href="/dashboard/notificaciones"
            onClick={() => setOpen(false)}
            className="block text-center text-xs text-accent hover:underline px-4 py-3 border-t border-border"
          >
            Ver el centro de notificaciones
          </a>
        </div>
      )}
    </div>
  );
}
