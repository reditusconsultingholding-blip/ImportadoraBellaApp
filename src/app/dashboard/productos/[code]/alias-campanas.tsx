"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Los otros nombres con que el equipo escribe este producto en las campañas de
// prueba, que no llevan código. Emilia, 23-nov: «vamos agregando productos…
// debe haber alguna manera para sincronizar». Con esto, una campaña nueva
// llamada «VITAL DROP / TESTEO» cae sola en Vitaldrops.

export default function AliasCampanas({
  productId,
  alias,
  puedeEditar,
}: {
  productId: string;
  alias: string[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [lista, setLista] = useState(alias);
  const [nuevo, setNuevo] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(siguiente: string[]) {
    setGuardando(true);
    setEstado(null);
    try {
      const res = await fetch("/api/productos/alias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, alias: siguiente }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      setLista(j.alias);
      setEstado(
        j.campanasReasignadas > 0
          ? `Guardado. ${j.campanasReasignadas} campañas se asignaron de nuevo.`
          : "Guardado. Las campañas nuevas con este nombre caen solas aquí.",
      );
      router.refresh();
    } catch (e) {
      setEstado(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  if (!puedeEditar && lista.length === 0) return null;

  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="text-xs font-mono uppercase tracking-wide text-muted">Otros nombres en las campañas</p>
      <p className="mt-1 text-xs text-muted">
        Si una campaña de prueba no lleva el código del producto, Jarvis la reconoce por cualquiera de estos nombres (sin
        importar tildes ni mayúsculas). Ejemplo: «VITAL DROP» para Vitaldrops.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lista.map((a) => (
          <span key={a} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs">
            {a}
            {puedeEditar && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => void guardar(lista.filter((x) => x !== a))}
                className="text-muted hover:text-critical"
                aria-label={`Quitar ${a}`}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {lista.length === 0 && <span className="text-xs text-muted">Ninguno todavía.</span>}
      </div>
      {puedeEditar && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nuevo.trim().length < 3) return;
            void guardar([...lista, nuevo]);
            setNuevo("");
          }}
        >
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Ej.: VITAL DROP"
            className="w-56 rounded border border-border bg-transparent px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={guardando || nuevo.trim().length < 3}
            className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Agregar"}
          </button>
        </form>
      )}
      {estado && <p className="mt-1.5 text-xs text-muted">{estado}</p>}
    </div>
  );
}
