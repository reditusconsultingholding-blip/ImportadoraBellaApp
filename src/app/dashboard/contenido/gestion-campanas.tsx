"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ProductOption = { id: string; code: string; name: string };

type Campana = {
  id: string;
  origen: "sync" | "manual";
  nombre: string;
  plataforma: string | null;
  activa: boolean;
  productId: string | null;
  producto: { id: string; code: string; name: string } | null;
  productoTexto?: string | null;
  productManual?: boolean;
  tipoCampana?: string | null;
  lote?: { numero: number; nomenclatura: string | null } | null;
};

export default function GestionCampanas({ products }: { products: ProductOption[] }) {
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [manuales, setManuales] = useState<Campana[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [soloSinProducto, setSoloSinProducto] = useState(false);
  const [asignando, setAsignando] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [nueva, setNueva] = useState({ nombre: "", productId: "", plataforma: "" });

  function cargar() {
    setCargando(true);
    const qs = new URLSearchParams();
    if (busqueda.trim()) qs.set("buscar", busqueda.trim());
    if (plataforma) qs.set("plataforma", plataforma);
    if (soloSinProducto) qs.set("sinProducto", "1");
    fetch(`/api/contenido/campanas?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setCampanas(d?.campanas ?? []);
        setManuales(d?.manuales ?? []);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }

  useEffect(() => {
    const t = setTimeout(cargar, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda, plataforma, soloSinProducto]);

  const todas = useMemo(() => [...campanas, ...manuales], [campanas, manuales]);
  const sinProducto = todas.filter((c) => !c.productId).length;

  async function asignarProducto(c: Campana, productId: string) {
    setAsignando(c.id);
    await fetch(`/api/contenido/campanas/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen: c.origen, productId: productId || null }),
    });
    setAsignando(null);
    cargar();
  }

  async function reactivarAutoMatch(c: Campana) {
    await fetch(`/api/contenido/campanas/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen: c.origen, productManual: false }),
    });
    cargar();
  }

  async function crearManual() {
    if (!nueva.nombre.trim()) {
      setErrorAlta("Ponle un nombre a la campaña.");
      return;
    }
    setGuardando(true);
    setErrorAlta(null);
    try {
      const r = await fetch("/api/contenido/campanas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nueva.nombre.trim(),
          productId: nueva.productId || undefined,
          plataforma: nueva.plataforma || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? `El servidor respondió ${r.status}`);
      setNueva({ nombre: "", productId: "", plataforma: "" });
      setCreando(false);
      cargar();
    } catch (e) {
      setErrorAlta(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function archivar(c: Campana) {
    await fetch(`/api/contenido/campanas/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origen: c.origen, archivar: true }),
    });
    cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar campaña…"
          className="min-w-[200px] rounded border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:border-accent"
        />
        <select
          value={plataforma}
          onChange={(e) => setPlataforma(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="">Todas las plataformas</option>
          <option value="META">Meta</option>
          <option value="TIKTOK">TikTok</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={soloSinProducto} onChange={(e) => setSoloSinProducto(e.target.checked)} />
          Solo sin producto
        </label>
        <span className="ml-auto text-xs text-muted">
          {todas.length} campañas{sinProducto > 0 && ` · ${sinProducto} sin producto`}
        </span>
        {!creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
          >
            + Campaña planeada
          </button>
        )}
      </div>

      {/* Alta manual de una campaña que todavía no existe en Meta ni en
          TikTok. La API ya lo permitía desde el principio; faltaba la pantalla,
          así que había que esperar a que el sync de cinco minutos la
          encontrara para poder trabajarla. Cuando la campaña real aparece, el
          sync borra esta y deja la de verdad. */}
      {creando && (
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Registrar una campaña planeada</p>
          <p className="mt-0.5 text-xs text-muted">
            Para trackearla desde ya. Cuando aparezca la campaña real en la plataforma, esta se
            reemplaza sola.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">Nombre</span>
              <input
                value={nueva.nombre}
                onChange={(e) => setNueva((n) => ({ ...n, nombre: e.target.value }))}
                placeholder="Como se va a llamar en la plataforma"
                className="min-w-[240px] rounded border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-border-strong"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">Producto</span>
              <select
                value={nueva.productId}
                onChange={(e) => setNueva((n) => ({ ...n, productId: e.target.value }))}
                className="min-w-[180px] rounded border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-border-strong"
              >
                <option value="">Sin asignar</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">Plataforma</span>
              <select
                value={nueva.plataforma}
                onChange={(e) => setNueva((n) => ({ ...n, plataforma: e.target.value }))}
                className="rounded border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-border-strong"
              >
                <option value="">Sin definir</option>
                <option value="META">Meta</option>
                <option value="TIKTOK">TikTok</option>
              </select>
            </label>
            <button
              type="button"
              onClick={crearManual}
              disabled={guardando}
              className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? "Registrando…" : "Registrar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreando(false);
                setErrorAlta(null);
              }}
              className="rounded border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
            >
              Cancelar
            </button>
          </div>
          {errorAlta && <p className="mt-2 text-xs text-critical">{errorAlta}</p>}
        </div>
      )}

      <div className="overflow-hidden rounded border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="px-3 py-2">Campaña</th>
                <th className="px-3 py-2">Plataforma</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Lote</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">
                    Cargando…
                  </td>
                </tr>
              ) : todas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">
                    Ninguna campaña coincide.
                  </td>
                </tr>
              ) : (
                todas.map((c) => (
                  <tr key={`${c.origen}-${c.id}`} className="border-b border-border last:border-b-0">
                    <td className="max-w-[240px] truncate px-3 py-2" title={c.nombre}>
                      {c.nombre}
                      {c.origen === "manual" && (
                        <span className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-[9px] text-muted">
                          manual
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.plataforma ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.tipoCampana ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{c.lote?.nomenclatura ?? "—"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={c.productId ?? ""}
                        onChange={(e) => asignarProducto(c, e.target.value)}
                        disabled={asignando === c.id}
                        className="rounded border border-border bg-transparent px-1.5 py-1 text-xs outline-none focus:border-accent"
                      >
                        <option value="">Sin producto…</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {c.producto && (
                        <Link
                          href={`/dashboard/productos/${encodeURIComponent(c.producto.code)}`}
                          className="ml-1.5 text-[10px] text-accent-strong hover:underline"
                        >
                          ver →
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {c.origen === "sync" && c.productManual && (
                        <button
                          onClick={() => reactivarAutoMatch(c)}
                          title="Volver a dejar que el sync la matchee sola"
                          className="mr-2 text-[10px] text-muted hover:text-foreground"
                        >
                          auto
                        </button>
                      )}
                      {c.origen === "sync" && (
                        <button onClick={() => archivar(c)} title="Archivar" className="text-muted hover:text-critical">
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted">
        Las campañas &quot;manual&quot; son filas planeadas o recién importadas que todavía no
        cruzan con ninguna campaña real de Meta/TikTok — al aparecer la campaña real, esta fila
        se borra sola.
      </p>
    </div>
  );
}
