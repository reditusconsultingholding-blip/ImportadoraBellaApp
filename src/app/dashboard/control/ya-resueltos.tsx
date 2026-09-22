"use client";

// Lo que YA se decidió, con la forma de deshacerlo.
//
// Enlazar un nombre lo sacaba de la lista y no volvía a aparecer por ningún
// lado. Mientras todo salga bien no se nota, pero Emilia marcó un producto
// como testeo sin querer —y "testeo" saca esas ventas de la cuenta del mes—,
// así que un clic equivocado le movió los números y no había desde dónde
// arreglarlo.
//
// Acá está todo lo resuelto: a qué producto quedó cada nombre, o si se marcó
// como testeo o como "no es un producto", y un botón para deshacerlo. Al
// deshacer vuelve a la lista de arriba, para volver a decidir.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Resuelto = {
  nombre: string;
  /** A qué producto quedó enlazado, si lo está. */
  producto: { code: string; name: string } | null;
  /** O por qué se dejó fuera: "testeo" o "ignorar". */
  motivo: string | null;
  /** Pedidos del período, para saber cuánto mueve deshacerlo. */
  pedidos: number;
};

const entero = (n: number) => Math.round(n).toLocaleString("es-EC");

export default function YaResueltos({ resueltos }: { resueltos: Resuelto[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function deshacer(r: Resuelto) {
    setOcupado(r.nombre);
    setError(null);
    try {
      const url = r.motivo
        ? `/api/enlaces-shopify/excluir?nombre=${encodeURIComponent(r.nombre)}`
        : `/api/enlaces-shopify?nombre=${encodeURIComponent(r.nombre)}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "No se pudo deshacer.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo deshacer.");
    } finally {
      setOcupado(null);
    }
  }

  if (resueltos.length === 0) return null;

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? resueltos.filter(
        (r) =>
          r.nombre.toLowerCase().includes(q) ||
          (r.producto?.name ?? "").toLowerCase().includes(q) ||
          (r.producto?.code ?? "").includes(q),
      )
    : resueltos;

  const enTesteo = resueltos.filter((r) => r.motivo === "testeo").length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Nombres ya resueltos</span>
          <span className="block text-xs text-muted">
            {resueltos.length} decididos
            {enTesteo > 0 && ` · ${enTesteo} marcados como testeo`} — acá se deshace si alguno
            quedó mal
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="hidden sm:inline">{abierto ? "cerrar" : "abrir"}</span>
          <span aria-hidden className={`inline-block transition-transform ${abierto ? "rotate-90" : ""}`}>
            ▸
          </span>
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border px-4 py-3">
          {error && (
            <p className="mb-2 rounded border border-critical bg-critical-bg px-2.5 py-1.5 text-xs text-critical">
              {error}
            </p>
          )}

          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar un nombre o un producto…"
            className="mb-3 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          />

          <ul className="flex max-h-[26rem] flex-col gap-1 overflow-y-auto">
            {visibles.map((r) => (
              <li
                key={r.nombre}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border px-2.5 py-1.5"
              >
                <span className="min-w-[12rem] flex-1 truncate text-sm">{r.nombre}</span>

                {r.motivo ? (
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      r.motivo === "testeo"
                        ? "border-warning/40 bg-pending-bg text-warning"
                        : "border-border bg-surface-2 text-muted"
                    }`}
                  >
                    {r.motivo === "testeo" ? "testeo" : "no es un producto"}
                  </span>
                ) : (
                  <span className="shrink-0 truncate text-xs text-muted">
                    → {r.producto?.code} · {r.producto?.name}
                  </span>
                )}

                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {entero(r.pedidos)} pedidos
                </span>

                <button
                  type="button"
                  onClick={() => deshacer(r)}
                  disabled={ocupado === r.nombre}
                  className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-50"
                >
                  {ocupado === r.nombre ? "Deshaciendo…" : "Deshacer"}
                </button>
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="py-3 text-center text-sm text-muted">Ningún nombre coincide.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
