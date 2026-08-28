"use client";

import { useEffect, useMemo, useState } from "react";
import { GUIA_COLUMNAS, REGLAS_DE_RONDA } from "@/lib/pipeline-options";

type Asset = {
  id: string;
  parentId: string | null;
  kind: "CARPETA" | "LINK" | "NOTA";
  title: string;
  url: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

const ICONO: Record<Asset["kind"], string> = {
  CARPETA: "📁",
  LINK: "🔗",
  NOTA: "📝",
};

/**
 * El material del que sale un anuncio: carpetas, links y notas del producto.
 *
 * Antes esto estaba repartido entre Drive, el chat y la cabeza de quien lo
 * produjo, así que cada pieza nueva empezaba de cero buscando de qué partir.
 */
export default function Repositorio({ productId }: { productId: string }) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [creandoEn, setCreandoEn] = useState<string | null | undefined>(undefined);
  const [tipo, setTipo] = useState<Asset["kind"]>("CARPETA");
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/productos/assets?productId=${encodeURIComponent(productId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        setAssets(d.assets ?? []);
        setPuedeEditar(Boolean(d.puedeEditar));
      })
      .catch(() => {
        if (!cancelado) setAssets([]);
      });
    return () => {
      cancelado = true;
    };
  }, [productId]);

  // El árbol se arma en el navegador: son decenas de nodos, y pedir cada
  // carpeta al abrirla se sentiría lento sin ninguna ganancia.
  const hijosDe = useMemo(() => {
    const mapa = new Map<string | null, Asset[]>();
    for (const a of assets ?? []) {
      const clave = a.parentId;
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(a);
    }
    return mapa;
  }, [assets]);

  function limpiar() {
    setCreandoEn(undefined);
    setTitulo("");
    setUrl("");
    setNota("");
    setError(null);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/productos/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          parentId: creandoEn ?? null,
          kind: tipo,
          title: titulo,
          url,
          notes: nota,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "No se pudo guardar.");
        return;
      }
      setAssets((prev) => [...(prev ?? []), d.asset]);
      if (creandoEn) setAbiertas((prev) => new Set(prev).add(creandoEn));
      limpiar();
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(a: Asset) {
    const hijos = hijosDe.get(a.id)?.length ?? 0;
    const ok = confirm(
      hijos > 0
        ? `Borrar "${a.title}" se lleva también lo que tiene adentro (${hijos}). ¿Lo borro?`
        : `¿Borrar "${a.title}"?`
    );
    if (!ok) return;

    const res = await fetch(`/api/productos/assets?id=${encodeURIComponent(a.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo borrar.");
      return;
    }
    // Se saca el nodo y todo lo que colgaba de él.
    setAssets((prev) => {
      const quedan = prev ?? [];
      const aBorrar = new Set([a.id]);
      let cambio = true;
      while (cambio) {
        cambio = false;
        for (const x of quedan) {
          if (x.parentId && aBorrar.has(x.parentId) && !aBorrar.has(x.id)) {
            aBorrar.add(x.id);
            cambio = true;
          }
        }
      }
      return quedan.filter((x) => !aBorrar.has(x.id));
    });
  }

  function Rama({ padre, nivel }: { padre: string | null; nivel: number }) {
    const items = hijosDe.get(padre) ?? [];
    if (items.length === 0 && nivel > 0) {
      return <p className="py-1 pl-6 text-xs text-muted">Carpeta vacía.</p>;
    }
    return (
      <>
        {items.map((a) => {
          const abierta = abiertas.has(a.id);
          return (
            <div key={a.id}>
              <div
                className="group flex items-start gap-2 rounded px-2 py-1.5 transition hover:bg-surface-2"
                style={{ paddingLeft: `${nivel * 1.25 + 0.5}rem` }}
              >
                <span className="mt-px shrink-0 text-xs" aria-hidden>
                  {ICONO[a.kind]}
                </span>

                <span className="min-w-0 flex-1">
                  {a.kind === "CARPETA" ? (
                    <button
                      onClick={() =>
                        setAbiertas((prev) => {
                          const next = new Set(prev);
                          if (next.has(a.id)) next.delete(a.id);
                          else next.add(a.id);
                          return next;
                        })
                      }
                      className="text-left text-sm font-medium hover:underline"
                    >
                      {a.title}
                      <span className="ml-1.5 text-xs text-muted">
                        {abierta ? "▾" : "▸"} {hijosDe.get(a.id)?.length ?? 0}
                      </span>
                    </button>
                  ) : a.kind === "LINK" && a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm text-accent-strong hover:underline"
                    >
                      {a.title}
                    </a>
                  ) : (
                    <span className="block text-sm font-medium">{a.title}</span>
                  )}

                  {a.kind === "LINK" && a.url && (
                    <span className="block truncate text-xs text-muted">{a.url}</span>
                  )}
                  {a.notes && (
                    <span className="mt-0.5 block whitespace-pre-wrap text-xs text-muted">
                      {a.notes}
                    </span>
                  )}
                  <span className="block text-[10px] text-muted">Lo subió {a.createdBy.name}</span>
                </span>

                {puedeEditar && (
                  <span className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    {a.kind === "CARPETA" && (
                      <button
                        onClick={() => {
                          setCreandoEn(a.id);
                          setTipo("LINK");
                        }}
                        className="text-xs text-muted hover:text-foreground"
                        title="Agregar aquí adentro"
                      >
                        +
                      </button>
                    )}
                    <button
                      onClick={() => borrar(a)}
                      className="text-xs text-muted hover:text-critical"
                      title="Borrar"
                    >
                      ✕
                    </button>
                  </span>
                )}
              </div>

              {a.kind === "CARPETA" && abierta && <Rama padre={a.id} nivel={nivel + 1} />}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <div>
            <h2 className="text-sm font-semibold">Dirección creativa</h2>
            <p className="text-xs text-muted">
              Referencias, guiones y material del que parte cada pieza.
            </p>
          </div>
          {puedeEditar && (
            <button
              onClick={() => {
                setCreandoEn(null);
                setTipo("CARPETA");
              }}
              className="rounded border border-border px-2.5 py-1 text-xs text-muted transition hover:border-border-strong hover:text-foreground"
            >
              + Agregar
            </button>
          )}
        </div>

        <div className="p-2">
          {assets == null ? (
            <p className="px-2 py-4 text-sm text-muted">Cargando…</p>
          ) : assets.length === 0 && creandoEn === undefined ? (
            <p className="px-2 py-6 text-center text-sm text-muted">
              Todavía no hay nada guardado. Empieza por una carpeta.
            </p>
          ) : (
            <Rama padre={null} nivel={0} />
          )}

          {creandoEn !== undefined && (
            <form onSubmit={crear} className="mt-2 flex flex-col gap-2 rounded border border-border p-2.5">
              <p className="text-xs text-muted">
                {creandoEn ? "Agregando dentro de una carpeta" : "Agregando en la raíz"}
              </p>

              <div className="flex gap-1.5">
                {(["CARPETA", "LINK", "NOTA"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${
                      tipo === t
                        ? "border-accent bg-good-bg text-accent-strong"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {ICONO[t]} {t === "CARPETA" ? "Carpeta" : t === "LINK" ? "Link" : "Nota"}
                  </button>
                ))}
              </div>

              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Nombre"
                autoFocus
                className="rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
              />

              {tipo === "LINK" && (
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  className="rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
              )}

              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Qué es y para qué sirve (opcional)"
                rows={2}
                className="resize-none rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
              />

              {error && <p className="text-xs text-critical">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={guardando || !titulo.trim()}
                  className="rounded bg-accent px-3 py-1 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={limpiar}
                  className="text-xs text-muted transition hover:text-foreground"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <GuiaColumnas />
    </div>
  );
}

/**
 * La guía de las columnas y las reglas de ronda.
 *
 * Vive en pantalla y no en un documento aparte: una convención que hay que ir a
 * buscar a otro lado es una convención que la mitad del equipo no sigue.
 */
function GuiaColumnas() {
  const [abierta, setAbierta] = useState(false);

  return (
    <div className="rounded border border-border bg-surface">
      <button
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-surface-2"
      >
        <span className="text-sm font-semibold">Guía de las columnas · SuperAds V2</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden
          className={`ml-auto text-muted transition-transform ${abierta ? "rotate-180" : ""}`}
        >
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {abierta && (
        <div className="flex flex-col gap-4 border-t border-border px-4 py-3">
          <div className="overflow-x-auto">
            <table className="table-cols w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-2 py-2 font-semibold">Columna</th>
                  <th className="px-2 py-2 font-semibold">Tipo</th>
                  <th className="px-2 py-2 font-semibold">Para qué sirve / cómo llenarla</th>
                </tr>
              </thead>
              <tbody>
                {GUIA_COLUMNAS.map((g) => (
                  <tr key={g.columna} className="border-b border-border last:border-b-0">
                    <td className="whitespace-nowrap px-2 py-2 font-medium">{g.columna}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-muted">{g.tipo}</td>
                    <td className="px-2 py-2 leading-relaxed">{g.para}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              Regla de diversidad por ronda
            </p>
            <ol className="flex flex-col gap-1.5">
              {REGLAS_DE_RONDA.map((r, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="mt-px w-4 shrink-0 text-right font-mono text-xs text-muted">
                    {i + 1}
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
