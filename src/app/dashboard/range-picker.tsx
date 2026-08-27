"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RANGES, type RangeId } from "@/lib/date-range";

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
}: {
  active: RangeId;
  label: string;
  from: string;
  to: string;
  platform: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  function go(rango: RangeId) {
    if (rango === "personalizado") {
      setOpen((v) => !v);
      return;
    }
    setOpen(false);
    router.push(`/dashboard?platform=${platform}&rango=${rango}`);
  }

  function applyCustom() {
    setOpen(false);
    router.push(
      `/dashboard?platform=${platform}&rango=personalizado&desde=${customFrom}&hasta=${customTo}`
    );
  }

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => {
          const on = active === r.id;
          return (
            <button
              key={r.id}
              onClick={() => go(r.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {active === "personalizado" && !open && (
        <p className="mt-1.5 text-xs text-muted">Mostrando {label}</p>
      )}

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,90vw)] rounded border border-border bg-surface p-3 shadow-[var(--shadow-pop)]">
          <p className="mb-2 text-xs text-muted">
            Elegí dos fechas, o la misma dos veces para ver un solo día.
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
