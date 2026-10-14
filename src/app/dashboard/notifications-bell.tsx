"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { etiquetaDe, nivelDe, nivelPorId } from "@/lib/notificaciones-orden";
import { useSondeo } from "./usar-sondeo";

type Notification = {
  id: string;
  message: string;
  link: string | null;
  type: string;
  read: boolean;
  createdAt: string;
};

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

  useSondeo(load, 30000);

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
        <div className="absolute right-0 z-20 mt-2 max-h-96 w-[21rem] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-brand-navy shadow-[0_12px_32px_rgb(0_0_0/0.35)]">
          {/* La rejilla del fondo, la misma del contador de datos y del
              arranque del día. Las tres son piezas que se abren sobre el
              trabajo y cuentan el estado de algo: comparten lenguaje a
              propósito, para que se reconozcan entre sí. */}
          <span
            aria-hidden
            className="pointer-events-none sticky top-0 block h-0 opacity-[0.16]"
          >
            <span
              className="absolute left-0 top-0 block h-40 w-full"
              style={{
                backgroundImage:
                  "linear-gradient(rgb(0 164 124 / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(0 164 124 / 0.5) 1px, transparent 1px)",
                backgroundSize: "26px 26px",
                maskImage: "radial-gradient(90% 100% at 80% 0%, #000 0%, transparent 75%)",
                WebkitMaskImage: "radial-gradient(90% 100% at 80% 0%, #000 0%, transparent 75%)",
              }}
            />
          </span>

          {/* El encabezado se queda arriba al desplazar: con mil notificaciones
              sin leer, "Marcar todo leído" quedaba a mil filas de distancia. */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-brand-navy/95 px-4 py-3 backdrop-blur-sm">
            {/* El mismo número que muestra el centro de notificaciones: los dos
                cuentan TODAS las sin leer, sin recorte por fecha. */}
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-white/70">
              {unreadCount > 0 ? (
                <>
                  <span className="text-brand-green">{unreadCount}</span> sin leer
                </>
              ) : (
                "Notificaciones"
              )}
            </p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-white/70 transition hover:border-brand-green hover:text-white"
              >
                Marcar todo leído
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-white/45">No hay notificaciones.</p>
          ) : (
            items.map((n) => {
              // Misma lectura de urgencia que el centro de notificaciones, y
              // por eso sale de la librería compartida: si la campana pintara
              // con su propio criterio, algo urgente ahí sería "normal" allá.
              const nivel = nivelPorId(nivelDe(n));
              return (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`relative w-full border-b border-white/[0.07] px-4 py-3 text-left transition last:border-b-0 hover:bg-white/[0.05] ${
                    n.read ? "" : "bg-white/[0.03]"
                  }`}
                >
                  {/* El filo de color del nivel. Va como elemento y no como
                      `border-left`: así llega de borde a borde de la fila sin
                      dejar la muesca que deja un borde contra el redondeado. */}
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-[3px] ${nivel.filoOscuro}`}
                  />
                  <p className="mb-1 flex items-center gap-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${nivel.chipOscuro}`}
                    >
                      {nivel.label}
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wide text-white/35">
                      {etiquetaDe(n)}
                    </span>
                  </p>
                  <span className="block text-xs leading-relaxed text-white/85">{n.message}</span>
                  <span className="mt-1 block font-mono text-[10px] text-white/35">
                    {new Date(n.createdAt).toLocaleString("es-EC", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              );
            })
          )}
          <a
            href="/dashboard/notificaciones"
            onClick={() => setOpen(false)}
            className="sticky bottom-0 block border-t border-white/10 bg-brand-navy/95 px-4 py-3 text-center font-mono text-[11px] uppercase tracking-[0.1em] text-brand-green backdrop-blur-sm transition hover:text-white"
          >
            Ver el centro de notificaciones
          </a>
        </div>
      )}
    </div>
  );
}
