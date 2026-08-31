"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIAS,
  FILTRO_INICIAL,
  NIVELES,
  PERIODOS,
  agruparPorNivel,
  contarPorCategoria,
  contarPorNivel,
  etiquetaDe,
  filtrar,
  nivelDe,
  nivelPorId,
  periodoPorId,
  textoVacio,
  type CategoriaId,
  type FiltroNotificaciones,
  type LimitesPeriodo,
  type NivelId,
  type PeriodoId,
} from "@/lib/notificaciones-orden";

type Notification = {
  id: string;
  message: string;
  link: string | null;
  type: string;
  read: boolean;
  createdAt: string;
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// Los tres grupos de botones son el mismo control repetido, así que se dibuja
// una vez. Marcar el activo con aria-pressed y no solo con color es lo mismo
// que hacemos con la urgencia: el color nunca va solo.
function Chips<T extends string>({
  titulo,
  opciones,
  activo,
  onElegir,
}: {
  titulo: string;
  opciones: { id: T; label: string; ayuda?: string; cuenta?: number }[];
  activo: T;
  onElegir: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wide text-muted w-16 shrink-0">{titulo}</span>
      {opciones.map((o) => (
        <button
          key={o.id}
          onClick={() => onElegir(o.id)}
          title={o.ayuda}
          aria-pressed={activo === o.id}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            activo === o.id
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface-2 text-muted hover:text-foreground"
          }`}
        >
          {o.label}
          {o.cuenta !== undefined && <span className="ml-1.5 font-mono opacity-70">{o.cuenta}</span>}
        </button>
      ))}
    </div>
  );
}

export default function NotificationCenter({
  initialNotifications,
  limites,
  totalDelMes,
  sinLeerTotal,
  canCheckAlerts,
}: {
  initialNotifications: Notification[];
  limites: LimitesPeriodo;
  totalDelMes: number;
  sinLeerTotal: number;
  canCheckAlerts: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialNotifications);
  const [filtro, setFiltro] = useState<FiltroNotificaciones>(FILTRO_INICIAL);
  // Arranca con lo que contó el servidor —el mismo número de la campanita— y
  // baja a medida que se marca leído acá, sin volver a preguntar.
  const [sinLeer, setSinLeer] = useState(sinLeerTotal);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  const cambiar = (parte: Partial<FiltroNotificaciones>) => setFiltro((f) => ({ ...f, ...parte }));

  const visibles = useMemo(() => filtrar(items, filtro, limites), [items, filtro, limites]);
  const grupos = useMemo(() => agruparPorNivel(visibles), [visibles]);
  const porCategoria = useMemo(() => contarPorCategoria(items, filtro, limites), [items, filtro, limites]);
  const porNivel = useMemo(() => contarPorNivel(items, filtro, limites), [items, filtro, limites]);

  // Las categorías sin una sola notificación en todo lo cargado no se ofrecen:
  // un filtro que siempre devuelve cero es ruido. "Otras" solo aparece si de
  // verdad llegó un type que no está catalogado.
  const categoriasVisibles = useMemo(
    () => CATEGORIAS.filter((c) => items.some((n) => c.tipos.includes(n.type)) || (c.id === "otras" && porCategoria.otras > 0)),
    [items, porCategoria.otras]
  );

  // El "de cuántas" del encabezado ignora los otros filtros a propósito: es el
  // universo del período elegido, no el que ya quedó recortado por categoría y
  // urgencia. Si no, siempre diría "mostrando 4 de 4".
  const enElPeriodo = useMemo(
    () => filtrar(items, { ...FILTRO_INICIAL, periodo: filtro.periodo }, limites).length,
    [items, filtro.periodo, limites]
  );
  const hayFiltros =
    filtro.categoria !== FILTRO_INICIAL.categoria ||
    filtro.nivel !== FILTRO_INICIAL.nivel ||
    filtro.periodo !== FILTRO_INICIAL.periodo ||
    filtro.soloSinLeer;

  async function markRead(n: Notification) {
    if (n.read) return;
    await fetch(`/api/notifications/${n.id}/read`, { method: "POST" });
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setSinLeer((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    // Marca todas las del usuario, también las más viejas que el mes cargado,
    // así que el contador se va a cero entero — igual que la campanita.
    setSinLeer(0);
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
      // Se pide la misma ventana que trajo el servidor. Antes se pedían las 30
      // por defecto y la lista se quedaba con esas: el "de M" caía a 30 y las
      // notificaciones del mes desaparecían de la pantalla.
      const r = await fetch(`/api/notifications?limite=500&desde=${encodeURIComponent(limites.mes)}`);
      if (r.ok) {
        const d = await r.json();
        setItems(d.notifications);
        setSinLeer(d.unreadCount);
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 rounded border border-border bg-surface px-5 py-4">
        <Chips
          titulo="Acción"
          activo={filtro.categoria}
          onElegir={(categoria: CategoriaId | "todas") => cambiar({ categoria })}
          opciones={[
            { id: "todas" as const, label: "Todas", ayuda: "Sin filtrar por tipo", cuenta: porCategoria.todas },
            ...categoriasVisibles.map((c) => ({
              id: c.id,
              label: c.label,
              ayuda: c.ayuda,
              cuenta: porCategoria[c.id],
            })),
          ]}
        />
        <Chips
          titulo="Urgencia"
          activo={filtro.nivel}
          onElegir={(nivel: NivelId | "todos") => cambiar({ nivel })}
          opciones={[
            { id: "todos" as const, label: "Toda", ayuda: "Sin filtrar por urgencia", cuenta: porNivel.todos },
            ...NIVELES.map((n) => ({ id: n.id, label: n.label, ayuda: n.ayuda, cuenta: porNivel[n.id] })),
          ]}
        />
        <Chips
          titulo="Período"
          activo={filtro.periodo}
          onElegir={(periodo: PeriodoId) => cambiar({ periodo })}
          opciones={PERIODOS.map((p) => ({ id: p.id, label: p.label, ayuda: p.ayuda }))}
        />

        <div className="mt-1 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={filtro.soloSinLeer}
              onChange={(e) => cambiar({ soloSinLeer: e.target.checked })}
              className="accent-accent"
            />
            Solo sin leer
          </label>
          {hayFiltros && (
            <button onClick={() => setFiltro(FILTRO_INICIAL)} className="text-xs text-accent hover:underline">
              Quitar filtros
            </button>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-3">
            {canCheckAlerts && (
              <button
                onClick={checkAlertsNow}
                disabled={checking}
                className="rounded border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-60"
              >
                {checking ? "Revisando…" : "Revisar alertas ahora"}
              </button>
            )}
            {sinLeer > 0 && (
              <button onClick={markAllRead} className="text-xs text-accent hover:underline">
                Marcar todo leído ({sinLeer})
              </button>
            )}
          </span>
        </div>
      </div>

      {checkResult && <p className="text-xs text-muted">{checkResult}</p>}

      <p className="text-xs text-muted">
        Mostrando <strong className="font-mono text-foreground">{visibles.length}</strong> de {enElPeriodo}{" "}
        {periodoPorId(filtro.periodo).frase} · {items.length} cargadas del último mes · {sinLeer} sin leer en total.
        {totalDelMes > items.length && (
          <> Hay {totalDelMes} en el mes: se cargaron las {items.length} más recientes.</>
        )}
      </p>

      <div className="overflow-hidden rounded border border-border bg-surface">
        {visibles.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm text-muted">{textoVacio(filtro)}</p>
            {hayFiltros && enElPeriodo === 0 && items.length > 0 && (
              <button onClick={() => setFiltro(FILTRO_INICIAL)} className="mt-2 text-xs text-accent hover:underline">
                Ver todas las de la última semana
              </button>
            )}
          </div>
        ) : (
          // Se agrupa por urgencia y no por fecha: dentro de un período ya
          // acotado, lo primero que hay que ver es qué pide una decisión hoy.
          grupos.map((g) => (
            <section key={g.nivel.id}>
              <h2 className="flex items-center gap-2 border-b border-border bg-surface-2 px-5 py-2">
                <span className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${g.nivel.chip}`}>
                  {g.nivel.label}
                </span>
                <span className="text-xs text-muted">
                  {g.items.length} · {g.nivel.ayuda}
                </span>
              </h2>
              {g.items.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 border-b border-l-2 border-border px-5 py-4 last:border-b-0 ${
                    nivelPorId(nivelDe(n)).borde
                  } ${n.read ? "" : "bg-accent/5"}`}
                >
                  <span className="shrink-0 rounded bg-surface-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-foreground">
                    {etiquetaDe(n)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{n.message}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {fecha(n.createdAt)}
                      {!n.read && " · sin leer"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
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
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
