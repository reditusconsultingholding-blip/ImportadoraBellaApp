"use client";

// El aviso de las piezas que se cargaron sin decir qué son.
//
// Emilia: "sería bueno que si los chicos no cumplen con esto de aquí, saque
// una alerta". Lo que no cumplen es llenar el ángulo, el formato y los demás
// campos de la pieza — y eso no es papeleo: todo el tablero existe para poder
// contestar qué ángulo funciona, y una pieza sin ángulo es una prueba que se
// hizo, se pagó y no se puede contar.
//
// Por eso el aviso NOMBRA las piezas en vez de contarlas. "Hay 14 sin
// clasificar" no se arregla; "el UGC del shampoo, de María José, sin ángulo ni
// formato" sí.

import { useState } from "react";
import type { PiezaSinClasificar } from "@/lib/piezas-sin-clasificar";

export default function AvisoSinClasificar({
  piezas,
  /** Para saber si la lista es "lo tuyo" o "lo del equipo". */
  esDireccion,
  onAbrir,
}: {
  piezas: PiezaSinClasificar[];
  esDireccion: boolean;
  /** Lleva a la pieza para completarla sin salir de la pantalla. */
  onAbrir?: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);

  if (piezas.length === 0) return null;

  const personas = new Set(piezas.map((p) => p.responsable ?? "sin responsable"));

  return (
    <section className="overflow-hidden rounded-lg border border-warning bg-pending-bg">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:brightness-[0.98]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-warning">
            {piezas.length} {piezas.length === 1 ? "pieza está" : "piezas están"} sin clasificar
            {esDireccion && personas.size > 1 && ` · ${personas.size} personas`}
          </span>
          <span className="block text-xs text-muted">
            Sin ángulo y formato no se puede saber qué funcionó: esas piezas se pagan igual pero
            no entran en la comparación.
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-warning">
          <span className="hidden sm:inline">{abierto ? "cerrar" : "ver cuáles"}</span>
          <span aria-hidden className={`inline-block transition-transform ${abierto ? "rotate-90" : ""}`}>
            ▸
          </span>
        </span>
      </button>

      {abierto && (
        <ul className="flex max-h-[22rem] flex-col gap-1 overflow-y-auto border-t border-warning/30 bg-surface px-3 py-2.5">
          {piezas.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border px-2.5 py-1.5"
            >
              <span className="min-w-[10rem] flex-1 truncate text-sm" title={p.titulo}>
                {p.titulo}
                {p.producto && <span className="text-muted"> · {p.producto}</span>}
              </span>

              <span className="shrink-0 text-xs text-muted">
                {p.responsable ?? "sin responsable"} · {p.creadaEl}
              </span>

              <span className="shrink-0 text-[10px] text-warning" title={`Le falta: ${p.falta.join(", ")}`}>
                falta {p.falta.slice(0, 2).join(", ")}
                {p.falta.length > 2 && ` y ${p.falta.length - 2} más`}
              </span>

              {onAbrir && (
                <button
                  type="button"
                  onClick={() => onAbrir(p.id)}
                  className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium transition hover:bg-surface-2"
                >
                  Completar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
