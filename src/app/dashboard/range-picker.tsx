"use client";

import { useState } from "react";
import { RANGES, type RangeId } from "@/lib/date-range";
import { BarraDeCarga, Girando, useNavegar } from "./navegar";

// Selector de fechas del Panel. El rango viaja en la URL y no en estado local
// a propósito: así se puede compartir un link con el período ya puesto, y la
// pantalla vuelve a pedirle los datos al servidor en vez de filtrar en el
// navegador algo que quizá ni bajó.
export default function RangePicker({
  active,
  label,
  from,
  to,
  platform,
  basePath = "/dashboard",
}: {
  active: RangeId;
  label: string;
  from: string;
  to: string;
  platform: string;
  /**
   * A qué pantalla vuelve al cambiar el período. Estaba fijo en /dashboard,
   * así que usar este selector en Rentabilidad mandaba al panel.
   */
  basePath?: string;
}) {
  const { navegar, pendiente, destino } = useNavegar();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function go(rango: RangeId) {
    if (rango === "personalizado") {
      setOpen((v) => !v);
      return;
    }
    setOpen(false);
    navegar(`${basePath}?platform=${platform}&rango=${rango}`, rango);
  }

  function applyCustom() {
    setOpen(false);
    navegar(
      `${basePath}?platform=${platform}&rango=personalizado&desde=${customFrom}&hasta=${customTo}`,
      "personalizado"
    );
  }

  return (
    <div className="relative">
      <BarraDeCarga activa={pendiente} />

      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => {
          const on = active === r.id;
          // Solo se marca el que se apretó. Marcar los ocho pondría en duda
          // todo el selector cuando lo que se pidió fue un período.
          const cargando = destino === r.id;
          return (
            <button
              key={r.id}
              onClick={() => go(r.id)}
              disabled={pendiente}
              aria-busy={cargando}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on || cargando
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              } ${pendiente && !cargando ? "opacity-50" : ""}`}
            >
              {cargando && <Girando />}
              {r.label}
            </button>
          );
        })}
      </div>

      {/* El aviso en palabras, además del circulito. Los períodos largos tardan
          varios segundos, y en ese rato la pantalla sigue mostrando los números
          del período anterior: sin decirlo, se leen como si fueran los nuevos. */}
      {pendiente && (
        <p className="mt-1.5 text-xs text-muted">
          Cargando {RANGES.find((r) => r.id === destino)?.label ?? "el período"}… lo de abajo
          todavía es del período anterior.
        </p>
      )}

      {!pendiente && active === "personalizado" && !open && (
        <p className="mt-1.5 text-xs text-muted">Mostrando {label}</p>
      )}

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,90vw)] rounded border border-border bg-surface p-3 shadow-[var(--shadow-pop)]">
          <p className="mb-2 text-xs text-muted">
            Elige dos fechas, o la misma dos veces para ver un solo día.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Desde
              </span>
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Hasta
              </span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={applyCustom}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
            >
              Aplicar
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-2 text-xs text-muted transition hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
