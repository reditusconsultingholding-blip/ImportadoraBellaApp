"use client";

// El período que miran TODAS las pestañas de Contenido.
//
// Cada pestaña traía su propio recorte —el día a día abría en hoy, rendimiento
// tenía "7 / 30 / 90 días" y los lotes y las campañas no tenían ninguno—, así
// que "¿cómo nos fue la semana pasada?" se contestaba distinto en cada
// pantalla, o no se contestaba. Emilia lo pidió para rendimiento y Sebastián
// dijo "mejor en todas": es el mismo período, elegido una vez, y viaja en la
// dirección para que se pueda mandar un enlace ya filtrado.
//
// No se reusa el RangePicker del panel porque ese arma la dirección con
// `platform` y sin `vista`: usarlo acá sacaría al equipo de la pestaña en la
// que está cada vez que cambian el período.

import { useState } from "react";
import { RANGES, type RangeId } from "@/lib/date-range";
import { BarraDeCarga, useNavegar } from "../navegar";

export default function RangoContenido({
  vista,
  activo,
  desde,
  hasta,
}: {
  /** La pestaña en la que se está, para no perderla al cambiar de período. */
  vista: string;
  activo: RangeId;
  desde: string;
  hasta: string;
}) {
  const { navegar, pendiente } = useNavegar();
  const [abierto, setAbierto] = useState(false);
  const [desdeLibre, setDesdeLibre] = useState(desde);
  const [hastaLibre, setHastaLibre] = useState(hasta);

  function ir(rango: RangeId) {
    if (rango === "personalizado") {
      setAbierto((v) => !v);
      return;
    }
    setAbierto(false);
    navegar(`/dashboard/contenido?vista=${vista}&rango=${rango}`, rango);
  }

  function aplicarLibre() {
    setAbierto(false);
    navegar(
      `/dashboard/contenido?vista=${vista}&rango=personalizado&desde=${desdeLibre}&hasta=${hastaLibre}`,
      "personalizado",
    );
  }

  return (
    <div className="relative">
      <BarraDeCarga activa={pendiente} />

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
          Período
        </span>
        {RANGES.map((r) => {
          const on = activo === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => ir(r.id)}
              aria-pressed={on}
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

      {abierto && (
        <div className="absolute z-20 mt-2 flex flex-wrap items-end gap-2 rounded border border-border bg-surface p-3 shadow-pop">
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Desde
            <input
              type="date"
              value={desdeLibre}
              onChange={(e) => setDesdeLibre(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted">
            Hasta
            <input
              type="date"
              value={hastaLibre}
              onChange={(e) => setHastaLibre(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={aplicarLibre}
            className="rounded border border-accent bg-good-bg px-3 py-1.5 text-xs font-medium text-accent-strong transition hover:brightness-95"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}
