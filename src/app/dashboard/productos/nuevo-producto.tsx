"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type ShopifyItem = { shopifyProductId: string; title: string; seguido: boolean };
type CampanaItem = { id: string; nombre: string; plataforma: string; producto: { name: string } | null };

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const codigoDesde = (titulo: string) =>
  plano(titulo)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .toUpperCase();

/**
 * Crear un producto a mano y anclarlo: al producto de Shopify (para que la
 * economía real no dependa de que el nombre matchee solo), a una campaña que
 * ya esté corriendo en Meta o TikTok, y a sus links de trackeo. Así el
 * seguimiento es efectivo desde el primer día, no cuando el auto-match
 * eventualmente adivine.
 */
export default function NuevoProducto() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState("");
  const [code, setCode] = useState("");
  const [codeTocado, setCodeTocado] = useState(false);

  const [shopifyBusqueda, setShopifyBusqueda] = useState("");
  const [shopifyItems, setShopifyItems] = useState<ShopifyItem[] | null>(null);
  const [shopifyElegido, setShopifyElegido] = useState<ShopifyItem | null>(null);

  const [campanaBusqueda, setCampanaBusqueda] = useState("");
  const [campanaItems, setCampanaItems] = useState<CampanaItem[]>([]);
  const [campanaElegida, setCampanaElegida] = useState<CampanaItem | null>(null);

  const [links, setLinks] = useState<{ url: string; etiqueta: string }[]>([]);

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!abierto || shopifyItems) return;
    fetch("/api/catalogo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setShopifyItems(d?.items ?? []))
      .catch(() => setShopifyItems([]));
  }, [abierto, shopifyItems]);

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

  const shopifyFiltrados = useMemo(() => {
    if (!shopifyItems) return [];
    const q = plano(shopifyBusqueda.trim());
    if (!q) return shopifyItems.filter((i) => !i.seguido).slice(0, 30);
    return shopifyItems.filter((i) => !i.seguido && plano(i.title).includes(q)).slice(0, 30);
  }, [shopifyItems, shopifyBusqueda]);

  function elegirShopify(item: ShopifyItem) {
    setShopifyElegido(item);
    setShopifyBusqueda(item.title);
    if (!nombre.trim()) setNombre(item.title);
    if (!codeTocado) setCode(codigoDesde(item.title));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    if (!nombre.trim() || !code.trim()) {
      setError("Ponle nombre y código al producto.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name: nombre,
          shopifyProductId: shopifyElegido?.shopifyProductId,
          shopifyProductTitle: shopifyElegido?.title,
          campaignId: campanaElegida?.id,
          links: links.filter((l) => l.url.trim()),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el producto.");
        return;
      }
      setAbierto(false);
      setNombre("");
      setCode("");
      setCodeTocado(false);
      setShopifyElegido(null);
      setShopifyBusqueda("");
      setCampanaElegida(null);
      setCampanaBusqueda("");
      setLinks([]);
      router.refresh();
    } catch {
      setError("No se pudo crear el producto. Revisa la conexión.");
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
      >
        + Nuevo producto
      </button>
    );
  }

  return (
    <form
      onSubmit={crear}
      className="flex flex-col gap-3 rounded border border-border bg-surface-2/50 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Nuevo producto</h3>
        <button type="button" onClick={() => setAbierto(false)} className="text-xs text-muted hover:text-foreground">
          Cancelar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del producto"
          className="min-w-[12rem] flex-1 rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setCodeTocado(true);
          }}
          placeholder="Código (como en las campañas)"
          className="w-56 rounded border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none focus:border-accent"
        />
      </div>

      {/* Anclaje a Shopify */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
          Producto de Shopify
        </p>
        <input
          value={shopifyBusqueda}
          onChange={(e) => {
            setShopifyBusqueda(e.target.value);
            if (shopifyElegido && e.target.value !== shopifyElegido.title) setShopifyElegido(null);
          }}
          placeholder="Buscar en el catálogo de Shopify…"
          className="w-full rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        {shopifyBusqueda && !shopifyElegido && shopifyFiltrados.length > 0 && (
          <div className="mt-1 max-h-40 overflow-y-auto rounded border border-border bg-surface">
            {shopifyFiltrados.map((i) => (
              <button
                type="button"
                key={i.shopifyProductId}
                onClick={() => elegirShopify(i)}
                className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-surface-2"
              >
                {i.title}
              </button>
            ))}
          </div>
        )}
        {shopifyElegido && (
          <p className="mt-1 text-[11px] text-good">Vinculado a &quot;{shopifyElegido.title}&quot; de Shopify.</p>
        )}
      </div>

      {/* Anclaje a campaña */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
          Campaña de Meta o TikTok (opcional)
        </p>
        <input
          value={campanaBusqueda}
          onChange={(e) => {
            setCampanaBusqueda(e.target.value);
            if (campanaElegida && e.target.value !== campanaElegida.nombre) setCampanaElegida(null);
          }}
          placeholder="Buscar campaña por nombre…"
          className="w-full rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        />
        {campanaBusqueda && !campanaElegida && campanaItems.length > 0 && (
          <div className="mt-1 max-h-40 overflow-y-auto rounded border border-border bg-surface">
            {campanaItems.map((c) => (
              <button
                type="button"
                key={c.id}
                onClick={() => {
                  setCampanaElegida(c);
                  setCampanaBusqueda(c.nombre);
                }}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-surface-2"
              >
                <span className="truncate">{c.nombre}</span>
                <span className="shrink-0 text-[10px] text-muted">{c.plataforma}</span>
              </button>
            ))}
          </div>
        )}
        {campanaElegida && (
          <p className="mt-1 text-[11px] text-good">Se asociará a &quot;{campanaElegida.nombre}&quot;.</p>
        )}
      </div>

      {/* Links de trackeo */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
            Links de trackeo {links.length > 0 && `(${links.length})`}
          </p>
          <button
            type="button"
            onClick={() => setLinks((l) => [...l, { url: "", etiqueta: "" }])}
            className="text-[11px] text-accent-strong hover:underline"
          >
            + Agregar link
          </button>
        </div>
        {links.map((l, i) => (
          <div key={i} className="mb-1 flex items-center gap-1.5">
            <input
              value={l.url}
              onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
              placeholder="https://…"
              className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <input
              value={l.etiqueta}
              onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? { ...x, etiqueta: e.target.value } : x)))}
              placeholder="etiqueta (opcional)"
              className="w-32 rounded border border-border bg-transparent px-2 py-1 text-xs outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}
              className="text-xs text-muted hover:text-critical"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-critical">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={guardando}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {guardando ? "Creando…" : "Crear producto"}
        </button>
      </div>
    </form>
  );
}
