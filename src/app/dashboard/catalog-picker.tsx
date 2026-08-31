"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Item = {
  title: string;
  // Llegan solo con el permiso de finanzas — ver /api/catalogo.
  price?: number | null;
  unitCost?: number | null;
  seguido: boolean;
  code: string | null;
};

const money = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-EC", { style: "currency", currency: "USD" });

// Se comparan sin acentos ni mayúsculas: buscar "te ginseng" tiene que
// encontrar "Té Ginseng".
const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Buscador del catálogo de Shopify para empezar a seguir productos.
 *
 * La tienda tiene cientos de productos y la mayoría nunca se pautea, así que
 * no tiene sentido cargarlos todos como fichas. Aquí se busca el que interesa y
 * se lo sigue; recién ahí entra en Pulso, Rentabilidad y los reportes.
 */
export default function CatalogPicker() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{
    items: Item[];
    error?: string;
    verCifras: boolean;
  } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto || datos) return;
    let cancelado = false;
    fetch("/api/catalogo")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado)
          setDatos({ items: d.items ?? [], error: d.error, verCifras: Boolean(d.verCifras) });
      })
      .catch(() => {
        if (!cancelado)
          setDatos({ items: [], error: "No se pudo leer el catálogo.", verCifras: false });
      });
    return () => {
      cancelado = true;
    };
  }, [abierto, datos]);

  useEffect(() => {
    if (abierto) buscadorRef.current?.focus();
  }, [abierto]);

  const visibles = useMemo(() => {
    const items = datos?.items ?? [];
    const q = plano(busqueda.trim());
    if (!q) return items;
    // Todas las palabras tienen que aparecer: "te rose" encuentra
    // "Té Apple Rose", "rose te" también.
    const palabras = q.split(/\s+/);
    return items.filter((i) => {
      const t = plano(i.title);
      return palabras.every((p) => t.includes(p));
    });
  }, [datos, busqueda]);

  // Los que se pueden agregar de los que están a la vista: sirve para dar de
  // alta un lote entero sin tildar de a uno. Buscar "batana" y seleccionar
  // todos es la forma rápida de cargar una familia de productos.
  const disponibles = useMemo(() => visibles.filter((i) => !i.seguido), [visibles]);

  function alternar(title: string) {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  async function seguir() {
    if (elegidos.size === 0) return;
    setGuardando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titles: [...elegidos] }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAviso(d.error ?? "No se pudo guardar.");
        return;
      }
      const partes = [`${d.creados.length} productos ahora se siguen`];
      if (d.campanasVinculadas > 0) partes.push(`${d.campanasVinculadas} campañas quedaron vinculadas`);
      if (d.omitidos.length > 0) partes.push(`${d.omitidos.length} se omitieron`);
      setAviso(partes.join(" · ") + ".");
      setElegidos(new Set());
      setDatos(null); // se vuelve a pedir para que salgan marcados como seguidos
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  async function refrescar() {
    setDatos(null);
    const r = await fetch("/api/catalogo?refrescar=1");
    const d = await r.json();
    setDatos({ items: d.items ?? [], error: d.error, verCifras: Boolean(d.verCifras) });
  }

  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
      >
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">Seguir un producto de Shopify</span>
          <span className="block text-xs text-muted">
            Busca cualquier producto de la tienda y agregalo al seguimiento. El catálogo se
            actualiza solo cada 5 minutos.
          </span>
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`shrink-0 text-muted transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {abierto && (
        <div className="border-t border-border p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={buscadorRef}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre…"
              className="flex-1 rounded border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={refrescar}
              className="rounded border border-border px-3 py-2 text-xs text-muted transition hover:border-border-strong hover:text-foreground"
            >
              Actualizar desde Shopify
            </button>
          </div>

          {aviso && <p className="mt-3 text-sm text-accent-strong">{aviso}</p>}
          {datos?.error && <p className="mt-3 text-sm text-critical">{datos.error}</p>}

          {datos == null ? (
            <p className="mt-4 text-sm text-muted">Leyendo el catálogo…</p>
          ) : (
            <>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>
                  {visibles.length} de {datos.items.length} productos
                  {busqueda.trim() ? " coinciden" : " en la tienda"}.
                </span>
                {disponibles.length > 0 && (
                  <button
                    onClick={() =>
                      setElegidos(new Set([...elegidos, ...disponibles.map((i) => i.title)]))
                    }
                    className="underline underline-offset-2 transition hover:text-foreground"
                  >
                    Seleccionar {disponibles.length}{" "}
                    {disponibles.length === 1 ? "disponible" : "disponibles"}
                  </button>
                )}
              </p>

              <div className="mt-2 max-h-80 overflow-y-auto rounded border border-border">
                {visibles.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted">
                    Ningún producto coincide con eso.
                  </p>
                )}
                {visibles.map((i) => {
                  const elegido = elegidos.has(i.title);
                  return (
                    <label
                      key={i.title}
                      className={`flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 transition hover:bg-surface-2 ${
                        i.seguido ? "opacity-55" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={elegido}
                        disabled={i.seguido}
                        onChange={() => alternar(i.title)}
                        className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{i.title}</span>
                        {/* Sin el permiso de finanzas el renglón no lleva un
                            precio en cero ni un guion: directamente no está,
                            porque el dato no viajó. */}
                        {datos?.verCifras && (
                          <span className="block text-xs tabular-nums text-muted">
                            Precio {money(i.price ?? null)} · Costo {money(i.unitCost ?? null)}
                          </span>
                        )}
                      </span>
                      {i.seguido && (
                        <span className="shrink-0 rounded-full border border-good/30 bg-good-bg px-1.5 py-0.5 text-[10px] font-medium text-good">
                          Siguiendo
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={seguir}
                  disabled={elegidos.size === 0 || guardando}
                  className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
                >
                  {guardando
                    ? "Guardando…"
                    : elegidos.size === 0
                      ? "Elige al menos uno"
                      : `Seguir ${elegidos.size} ${elegidos.size === 1 ? "producto" : "productos"}`}
                </button>
                {elegidos.size > 0 && (
                  <button
                    onClick={() => setElegidos(new Set())}
                    className="text-xs text-muted transition hover:text-foreground"
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
