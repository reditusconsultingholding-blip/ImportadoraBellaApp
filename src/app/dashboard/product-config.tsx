"use client";

import { useState } from "react";

// Los números que definen si un producto va bien o mal, editables donde se los
// mira.
//
// El CPA objetivo manda todo el Pulso: es el umbral contra el que se compara.
// Estaba solo en la ficha del producto, en otra pantalla — así que quien veía
// un semáforo rojo no podía corregir el umbral sin irse del panel, y muchos
// objetivos quedaron como los dejó la carga automática.

export type ConfigProducto = {
  productId: string;
  cpaTarget: number | null;
  salePrice: number | null;
  unitCost: number | null;
};

const numeroOVacio = (v: number | null) => (v == null ? "" : String(v));

export default function ProductConfig({
  inicial,
  puedeEditar,
  onGuardado,
}: {
  inicial: ConfigProducto;
  puedeEditar: boolean;
  onGuardado?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cpaTarget, setCpaTarget] = useState(numeroOVacio(inicial.cpaTarget));
  const [salePrice, setSalePrice] = useState(numeroOVacio(inicial.salePrice));
  const [unitCost, setUnitCost] = useState(numeroOVacio(inicial.unitCost));
  const [estado, setEstado] = useState<"limpio" | "guardando" | "guardado">("limpio");
  const [error, setError] = useState<string | null>(null);

  if (!puedeEditar) return null;

  // El margen se muestra mientras se escribe: es el número del que sale el CPA
  // objetivo, y verlo evita poner un umbral que el producto no aguanta.
  const precio = Number(salePrice);
  const costo = Number(unitCost);
  const margen =
    Number.isFinite(precio) && Number.isFinite(costo) && salePrice !== "" && unitCost !== ""
      ? precio - costo
      : null;

  async function guardar() {
    setEstado("guardando");
    setError(null);
    try {
      const res = await fetch("/api/board", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "product",
          id: inicial.productId,
          cpaTarget: cpaTarget === "" ? undefined : Number(cpaTarget),
          salePrice: salePrice === "" ? null : Number(salePrice),
          unitCost: unitCost === "" ? null : Number(unitCost),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "No se pudo guardar.");
        setEstado("limpio");
        return;
      }
      setEstado("guardado");
      onGuardado?.();
    } catch {
      setError("No se pudo guardar.");
      setEstado("limpio");
    }
  }

  const campo = (
    etiqueta: string,
    valor: string,
    set: (v: string) => void,
    ayuda?: string
  ) => (
    <label className="flex-1 min-w-[7rem]">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
        {etiqueta}
      </span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={valor}
        onChange={(e) => {
          set(e.target.value);
          setEstado("limpio");
        }}
        className="w-full rounded border border-border bg-surface px-2 py-1 text-sm tabular-nums outline-none focus:border-accent"
      />
      {ayuda && <span className="mt-0.5 block text-[10px] text-muted">{ayuda}</span>}
    </label>
  );

  return (
    <div className="rounded border border-border bg-surface">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-muted transition hover:text-foreground"
      >
        <span aria-hidden>⚙</span>
        Configurar este producto
        <svg
          width="10"
          height="10"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className={`ml-auto transition-transform ${abierto ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {abierto && (
        <div className="flex flex-col gap-2 border-t border-border px-2.5 py-2.5">
          <div className="flex flex-wrap gap-2">
            {campo("Precio de venta", salePrice, setSalePrice)}
            {campo("Costo por artículo", unitCost, setUnitCost)}
            {campo(
              "CPA objetivo",
              cpaTarget,
              setCpaTarget,
              margen != null ? `Margen bruto: ${margen.toFixed(2)}` : undefined
            )}
          </div>

          {margen != null && margen > 0 && (
            <p className="text-[11px] text-muted">
              Con ese margen, pagar más de {margen.toFixed(2)} por venta ya es perder plata. Un
              objetivo razonable deja algo de colchón: {(margen * 0.7).toFixed(2)}.
            </p>
          )}

          {error && <p className="text-xs text-critical">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={guardar}
              disabled={estado === "guardando"}
              className="rounded bg-accent px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
            >
              {estado === "guardando" ? "Guardando…" : "Guardar"}
            </button>
            {estado === "guardado" && (
              <span className="text-xs text-good">
                Guardado. El pulso se recalcula con el objetivo nuevo.
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
