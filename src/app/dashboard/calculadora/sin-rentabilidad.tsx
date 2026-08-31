"use client";

import { useState } from "react";
import Link from "next/link";
import type { Recomendacion } from "@/lib/recomendaciones";

// Los productos que están perdiendo plata, con qué hacer al respecto.
//
// Va debajo de la calculadora a propósito: la calculadora dice qué precio
// poner en un producto nuevo, y esto dice cuáles de los que ya están corriendo
// no dan. Es la misma cuenta mirada desde los dos lados.
//
// Las recomendaciones se calculan con la fórmula, no con un modelo, y cada una
// dice el número del que sale. El equipo puede además escribir la suya: la
// cuenta no sabe que un proveedor cambió el costo la semana pasada.

export type FilaSinRentabilidad = {
  code: string | null;
  name: string;
  gastoPauta: number;
  cpa: number | null;
  cpaBreakeven: number;
  cpaObjetivo: number;
  utilidad: number;
  precio: number;
  efectividad: number;
  devoluciones: number;
  recomendaciones: Recomendacion[];
  /** Lo que escribió el equipo, si escribió algo. */
  nota: string;
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const ETIQUETA: Record<Recomendacion["palanca"], { texto: string; clase: string }> = {
  cpa: { texto: "Pauta", clase: "bg-surface-2 text-warning" },
  precio: { texto: "Precio", clase: "bg-surface-2 text-accent-strong" },
  operacion: { texto: "Operación", clase: "bg-good-bg text-good" },
  apagar: { texto: "Apagar", clase: "bg-critical-bg text-critical" },
};

function Fila({ f }: { f: FilaSinRentabilidad }) {
  const [abierto, setAbierto] = useState(false);
  const [nota, setNota] = useState(f.nota);
  const [estado, setEstado] = useState<"limpio" | "guardando" | "guardado" | "error">("limpio");

  async function guardar() {
    setEstado("guardando");
    try {
      const res = await fetch("/api/calculadora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `parche` para no pisar los valores de la calculadora de este
        // producto, que se cargan desde la otra pantalla.
        body: JSON.stringify({ producto: f.name, parche: true, data: { recomendacion: nota } }),
      });
      setEstado(res.ok ? "guardado" : "error");
    } catch {
      setEstado("error");
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-surface-2"
      >
        <span
          aria-hidden
          className={`text-xs text-muted transition-transform ${abierto ? "rotate-90" : ""}`}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{f.name}</span>
          <span className="block text-xs text-muted">
            CPA {f.cpa == null ? "—" : money2(f.cpa)} · equilibrio {money2(f.cpaBreakeven)} ·{" "}
            {money(f.gastoPauta)} de pauta
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-critical">
            {money(f.utilidad)}
          </span>
          <span className="block text-xs text-muted">en el período</span>
        </span>
      </button>

      {abierto && (
        <div className="bg-surface-2/40 px-5 pb-4 pt-1">
          <ul className="flex flex-col gap-2.5">
            {f.recomendaciones.map((r, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ETIQUETA[r.palanca].clase}`}
                >
                  {ETIQUETA[r.palanca].texto}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.titulo}</span>
                  <span className="block text-xs leading-relaxed text-muted">{r.detalle}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Lo que decidió el equipo
              </span>
              <textarea
                value={nota}
                onChange={(e) => {
                  setNota(e.target.value);
                  setEstado("limpio");
                }}
                rows={2}
                placeholder="Qué se va a hacer con este producto, y por qué. Lo ve todo el equipo."
                className="w-full resize-none rounded border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            </label>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={guardar}
                disabled={estado === "guardando"}
                className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
              >
                {estado === "guardando" ? "Guardando…" : "Guardar"}
              </button>
              {estado === "guardado" && <span className="text-xs text-good">Guardado.</span>}
              {estado === "error" && (
                <span className="text-xs text-critical">No se pudo guardar.</span>
              )}
              {f.code && (
                <Link
                  href={`/dashboard/productos/${encodeURIComponent(f.code)}`}
                  className="ml-auto text-xs text-muted underline underline-offset-2 transition hover:text-foreground"
                >
                  Abrir el producto
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SinRentabilidad({
  filas,
  periodo,
}: {
  filas: FilaSinRentabilidad[];
  periodo: string;
}) {
  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">Productos que no están dando rentabilidad</h2>
        <p className="mt-0.5 text-xs text-muted">
          {periodo} · calculado con la economía real de cada uno: precio, costo, flete,
          confirmación y devoluciones. Toca uno para ver qué hacer.
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted">
          Ningún producto con economía cargada está perdiendo plata en este período.
        </p>
      ) : (
        <div className="flex flex-col">
          {filas.map((f) => (
            <Fila key={f.code ?? f.name} f={f} />
          ))}
        </div>
      )}

      {/* Se dice acá y no en letra chica: la utilidad sale de compras
          ATRIBUIDAS por Meta y TikTok, que casi siempre son más que las
          órdenes reales. Sin la advertencia, estas cifras se leen como plata
          contada. */}
      {filas.length > 0 && (
        <p className="border-t border-border px-5 py-2.5 text-xs text-muted">
          La utilidad se calcula sobre las compras que se atribuyen Meta y TikTok, que suelen ser
          más que las órdenes reales de Shopify. Sirve para comparar productos entre sí; para plata
          contada, mira Ventas.
        </p>
      )}
    </div>
  );
}
