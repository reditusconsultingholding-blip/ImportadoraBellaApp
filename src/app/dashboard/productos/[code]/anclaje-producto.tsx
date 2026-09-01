"use client";

import { useEffect, useRef, useState } from "react";

type CampanaItem = { id: string; nombre: string; plataforma: string };
type LinkProducto = { id: string; url: string; etiqueta: string | null };

export default function AnclajeProducto({
  code,
  shopifyProductTitle: shopifyInicial,
  links: linksIniciales,
  puedeEditar,
}: {
  code: string;
  shopifyProductTitle: string | null;
  links: LinkProducto[];
  puedeEditar: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const shopifyTitulo = shopifyInicial;
  const [links, setLinks] = useState(linksIniciales);

  const [campanaBusqueda, setCampanaBusqueda] = useState("");
  const [campanaItems, setCampanaItems] = useState<CampanaItem[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nuevoLink, setNuevoLink] = useState("");
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = campanaBusqueda.trim();
    debounce.current = setTimeout(() => {
      if (!q) {
        setCampanaItems([]);
        return;
      }
      fetch(`/api/contenido/campanas?buscar=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setCampanaItems(d?.campanas ?? []))
        .catch(() => setCampanaItems([]));
    }, 250);
  }, [campanaBusqueda]);

  async function asociarCampana(c: CampanaItem) {
    setError(null);
    const res = await fetch(`/api/productos/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: c.id }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "No se pudo asociar la campaña.");
      return;
    }
    setAviso(`Asociada a "${c.nombre}".`);
    setCampanaBusqueda("");
    setCampanaItems([]);
  }

  async function agregarLink() {
    if (!nuevoLink.trim()) return;
    setError(null);
    const res = await fetch(`/api/productos/${encodeURIComponent(code)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: nuevoLink.trim(), etiqueta: nuevaEtiqueta.trim() || undefined }),
    });
    const data = (await res.json()) as { link?: LinkProducto; error?: string };
    if (!res.ok || !data.link) {
      setError(data.error ?? "No se pudo agregar el link.");
      return;
    }
    setLinks((ls) => [...ls, data.link as LinkProducto]);
    setNuevoLink("");
    setNuevaEtiqueta("");
  }

  async function quitarLink(id: string) {
    setLinks((ls) => ls.filter((l) => l.id !== id));
    await fetch(`/api/productos/${encodeURIComponent(code)}?linkId=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  if (!puedeEditar && !shopifyTitulo && links.length === 0) return null;

  return (
    <div className="rounded border border-border bg-surface">
      <button
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-muted transition hover:text-foreground"
      >
        Anclaje del producto
        {shopifyTitulo && <span className="text-good">· Shopify vinculado</span>}
        {links.length > 0 && <span>· {links.length} link{links.length === 1 ? "" : "s"} de trackeo</span>}
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
        <div className="flex flex-col gap-3 border-t border-border px-2.5 py-2.5">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              Producto de Shopify
            </p>
            <p className="text-xs">
              {shopifyTitulo ? (
                <span className="text-good">Vinculado a &quot;{shopifyTitulo}&quot;.</span>
              ) : (
                <span className="text-muted">
                  Sin vincular. Se vincula al crear el producto desde el buscador de Shopify.
                </span>
              )}
            </p>
          </div>

          {puedeEditar && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Asociar una campaña de Meta o TikTok
              </p>
              <input
                value={campanaBusqueda}
                onChange={(e) => setCampanaBusqueda(e.target.value)}
                placeholder="Buscar campaña por nombre…"
                className="w-full rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent"
              />
              {campanaItems.length > 0 && (
                <div className="mt-1 max-h-32 overflow-y-auto rounded border border-border bg-surface-2/40">
                  {campanaItems.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => asociarCampana(c)}
                      className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-xs hover:bg-surface-2"
                    >
                      <span className="truncate">{c.nombre}</span>
                      <span className="shrink-0 text-[10px] text-muted">{c.plataforma}</span>
                    </button>
                  ))}
                </div>
              )}
              {aviso && <p className="mt-1 text-[11px] text-good">{aviso}</p>}
            </div>
          )}

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              Links de trackeo
            </p>
            {links.length === 0 && <p className="text-xs text-muted">Todavía no hay links cargados.</p>}
            {links.map((l) => (
              <div key={l.id} className="flex items-center gap-1.5 py-0.5 text-xs">
                <a href={l.url} target="_blank" rel="noreferrer" className="truncate text-accent-strong hover:underline">
                  {l.etiqueta || l.url}
                </a>
                {puedeEditar && (
                  <button onClick={() => quitarLink(l.id)} className="ml-auto text-muted hover:text-critical">
                    ✕
                  </button>
                )}
              </div>
            ))}
            {puedeEditar && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <input
                  value={nuevoLink}
                  onChange={(e) => setNuevoLink(e.target.value)}
                  placeholder="https://…"
                  className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent"
                />
                <input
                  value={nuevaEtiqueta}
                  onChange={(e) => setNuevaEtiqueta(e.target.value)}
                  placeholder="etiqueta"
                  className="w-24 rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent"
                />
                <button
                  onClick={agregarLink}
                  className="rounded bg-accent px-2 py-1 text-xs font-medium text-white transition hover:bg-accent-strong"
                >
                  + Link
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-critical">{error}</p>}
        </div>
      )}
    </div>
  );
}
