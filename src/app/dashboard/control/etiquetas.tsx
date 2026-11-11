"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ETIQUETAS, datosEtiqueta } from "@/lib/etiquetas-producto";

// Las etiquetas de un producto: se ven como chips de color y, si se puede
// editar, un clic abre la lista para marcar o desmarcar.

export function ChipsEtiquetas({ etiquetas }: { etiquetas: string[] }) {
  if (etiquetas.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {etiquetas.map((id) => {
        const e = datosEtiqueta(id);
        if (!e) return null;
        return (
          <span key={id} className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${e.clase}`}>
            {e.texto}
          </span>
        );
      })}
    </span>
  );
}

export default function EditorEtiquetas({
  productId,
  etiquetas,
  editable,
}: {
  productId: string | null;
  etiquetas: string[];
  editable: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [actuales, setActuales] = useState(etiquetas);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!productId || !editable) return <ChipsEtiquetas etiquetas={actuales} />;

  const alternar = async (id: string) => {
    const nuevas = actuales.includes(id) ? actuales.filter((e) => e !== id) : [...actuales, id];
    setGuardando(true);
    setError(null);
    const previas = actuales;
    setActuales(nuevas);
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, etiquetas: nuevas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      setActuales(data.etiquetas);
      router.refresh();
    } catch (e) {
      setActuales(previas);
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <span className="relative inline-flex flex-wrap items-center gap-1">
      <ChipsEtiquetas etiquetas={actuales} />
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        className="rounded-full border border-dashed border-border px-1.5 py-px text-[10px] text-muted hover:border-border-strong hover:text-foreground"
        aria-label="Editar etiquetas"
      >
        {actuales.length ? "editar" : "+ etiqueta"}
      </button>
      {abierto && (
        <span className="absolute left-0 top-full z-20 mt-1 flex w-48 flex-col gap-0.5 rounded-lg border border-border bg-surface p-1.5 shadow-lg">
          {ETIQUETAS.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-foreground hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={actuales.includes(e.id)}
                disabled={guardando}
                onChange={() => alternar(e.id)}
              />
              <span className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${e.clase}`}>{e.texto}</span>
            </label>
          ))}
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="mt-1 rounded px-1.5 py-1 text-left text-[11px] text-muted hover:text-foreground"
          >
            Listo
          </button>
          {error && <span className="px-1.5 text-[11px] text-critical">{error}</span>}
        </span>
      )}
    </span>
  );
}
