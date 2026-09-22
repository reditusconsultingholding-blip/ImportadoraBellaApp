"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BuscadorProducto from "../buscador-producto";

type ProductOption = { id: string; code: string; name: string };

type Campana = {
  id: string;
  origen: "sync" | "manual";
  nombre: string;
  plataforma: string | null;
  /** La cuenta publicitaria, para saber dónde buscarla. */
  cuenta?: string | null;
  /** Lo que gastó en los últimos siete días. */
  gasto7d?: number;
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
  // Activas por defecto, como el filtro que el equipo tiene en Notion: las
  // pausadas son historia y mezcladas tapaban lo que está corriendo.
  const [estado, setEstado] = useState<"activas" | "inactivas" | "">("activas");
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
    if (estado) qs.set("estado", estado);
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
  }, [busqueda, plataforma, soloSinProducto, estado]);

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
      {/* Igual que en Lotes: la pantalla estaba bien, lo que faltaba era decir
          para qué sirve. Sin eso se lee como un listado más de campañas, que es
          lo que ya se ve en Meta. */}
      <div className="rounded border border-border bg-surface px-4 py-3">
        <p className="text-sm font-semibold">Para qué sirve esta pantalla</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Es donde cada campaña de Meta y TikTok queda pegada a su producto. De ese vínculo salen
          la rentabilidad, el CPA por producto y el control publicitario: una campaña sin producto
          gasta plata que después no aparece asignada a nada. Acá también se puede registrar una
          campaña antes de lanzarla, para tenerla lista cuando exista de verdad.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
        {/* La búsqueda mira el nombre de la campaña Y el de la cuenta
            publicitaria: la pregunta de todos los días es "¿en qué cuenta
            está esta campaña?". */}
        <label className="relative min-w-[240px] flex-1">
          <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar campaña o cuenta publicitaria…"
            className="w-full rounded-lg border border-border bg-transparent py-1.5 pl-8 pr-3 text-xs outline-none focus:border-accent"
          />
        </label>
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Estado">
          {([["activas", "Activas"], ["inactivas", "Inactivas"], ["", "Todas"]] as const).map(([id, texto]) => (
            <button
              key={id || "todas"}
              type="button"
              onClick={() => setEstado(id)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${estado === id ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Plataforma">
          {([["", "Meta y TikTok"], ["META", "Meta"], ["TIKTOK", "TikTok"]] as const).map(([id, texto]) => (
            <button
              key={id || "ambas"}
              type="button"
              onClick={() => setPlataforma(id)}
              className={`rounded-md px-2.5 py-1 text-xs transition ${plataforma === id ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:text-foreground"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSoloSinProducto((v) => !v)}
          className={`rounded-full border px-2.5 py-1 text-xs transition ${soloSinProducto ? "border-warning bg-pending-bg text-warning" : "border-border text-muted hover:text-foreground"}`}
        >
          Sin producto
        </button>
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
              <BuscadorProducto
                opciones={products.map((p) => ({ id: p.id, nombre: p.name, codigo: p.code }))}
                valor={nueva.productId}
                onElegir={(id) => setNueva((n) => ({ ...n, productId: id }))}
                vacio="Sin asignar"
                ariaLabel="Producto"
                className="min-w-[220px]"
              />
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
                <th className="px-3 py-2">Cuenta</th>
                <th className="px-3 py-2">Plataforma</th>
                <th className="px-3 py-2 text-right">Gasto 7 días</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Lote</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    Cargando…
                  </td>
                </tr>
              ) : todas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted">
                    Ninguna campaña coincide.
                  </td>
                </tr>
              ) : (
                todas.map((c) => (
                  <tr key={`${c.origen}-${c.id}`} className="border-b border-border last:border-b-0">
                    <td className="max-w-[260px] truncate px-3 py-2" title={c.nombre}>
                      <span
                        className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${c.activa ? "bg-good" : "bg-border-strong"}`}
                        title={c.activa ? "Activa" : "Inactiva"}
                      />
                      {c.nombre}
                      {c.origen === "manual" && (
                        <span className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-[9px] text-muted">
                          manual
                        </span>
                      )}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-muted" title={c.cuenta ?? ""}>{c.cuenta ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.plataforma === "META" ? "Meta" : c.plataforma === "TIKTOK" ? "TikTok" : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                      {c.gasto7d ? c.gasto7d.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.tipoCampana ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{c.lote?.nomenclatura ?? "—"}</td>
                    <td className="px-3 py-2">
                      <BuscadorProducto
                        opciones={products.map((p) => ({ id: p.id, nombre: p.name, codigo: p.code }))}
                        valor={c.productId ?? ""}
                        onElegir={(id) => asignarProducto(c, id)}
                        disabled={asignando === c.id}
                        vacio="Sin producto…"
                        ariaLabel={`Producto de ${c.nombre ?? "la campaña"}`}
                        className="inline-block min-w-[200px] align-middle"
                      />
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
