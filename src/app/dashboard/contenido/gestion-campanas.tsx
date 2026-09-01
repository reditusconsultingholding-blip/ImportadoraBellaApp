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
      </div>

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
