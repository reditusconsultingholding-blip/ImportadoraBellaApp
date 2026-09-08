"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CampanaSinProducto, ProductoSinCampana } from "@/lib/sin-nomenclatura";
import { Girando } from "../navegar";

// La pantalla para emparejar lo que quedó suelto.
//
// Se asigna acá mismo, en la fila, y no entrando a una ficha por campaña: son
// listas de decenas de filas y el trabajo es repetitivo. Cada select guarda al
// cambiar y la fila desaparece de la lista — que es la señal de que quedó
// hecho, sin ningún cartel de confirmación que haya que leer cuarenta veces.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export type OpcionProducto = { id: string; code: string; name: string };

export default function Lista({
  campanas: campanasIniciales,
  productos,
  opciones,
  periodo,
}: {
  campanas: CampanaSinProducto[];
  productos: ProductoSinCampana[];
  opciones: OpcionProducto[];
  periodo: string;
}) {
  const [campanas, setCampanas] = useState(campanasIniciales);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloConGasto, setSoloConGasto] = useState(false);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return campanas.filter((c) => {
      if (soloConGasto && c.gasto <= 0) return false;
      if (!t) return true;
      return c.nombre.toLowerCase().includes(t) || c.cuenta.toLowerCase().includes(t);
    });
  }, [campanas, busqueda, soloConGasto]);

  const totalGasto = campanas.reduce((s, c) => s + c.gasto, 0);
  const totalCompras = campanas.reduce((s, c) => s + c.compras, 0);
  const conGasto = campanas.filter((c) => c.gasto > 0).length;

  async function asignar(campana: CampanaSinProducto, productId: string) {
    if (!productId) return;
    setGuardando(campana.id);
    setError(null);
    try {
      const res = await fetch(`/api/contenido/campanas/${campana.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origen: "sync", productId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(j?.error ?? `El servidor respondió ${res.status}.`);
        return;
      }
      // Fuera de la lista: lo que ya está emparejado no es un pendiente. Se
      // saca en memoria en vez de recargar la página entera porque quien está
      // asignando cuarenta campañas seguidas no quiere esperar cuarenta veces.
      setCampanas((previas) => previas.filter((c) => c.id !== campana.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(null);
    }
  }

  const claseCampo =
    "rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-border-strong focus:outline-none";

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">
          No se pudo guardar: {error}
        </p>
      )}

      {/* ------------------------ Campañas sin producto ---------------------- */}
      <section className="rounded border border-border bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Campañas sin producto asignado</h2>
            <p className="mt-0.5 text-xs text-muted">
              Gastan y venden, pero no suman a la rentabilidad de ningún producto. Ordenadas por
              gasto: la de arriba es la que más distorsiona los números.
            </p>
          </div>
          <span className="text-xs text-muted">{periodo}</span>
        </div>

        {campanas.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            Todas las campañas están conectadas a un producto. No hay nada que emparejar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
              {[
                { t: "Campañas sueltas", v: campanas.length.toLocaleString("es-EC") },
                { t: "Gastaron en el período", v: conGasto.toLocaleString("es-EC") },
                { t: "Gasto sin asignar", v: money(totalGasto) },
                { t: "Compras sin asignar", v: totalCompras.toLocaleString("es-EC") },
              ].map((c, i) => (
                <div
                  key={c.t}
                  className={`px-4 py-2.5 ${i % 2 === 1 ? "border-l border-border" : ""} ${
                    i < 2 ? "border-b border-border sm:border-b-0" : ""
                  } ${i === 2 ? "sm:border-l" : ""}`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                    {c.t}
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums">{c.v}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre de campaña o cuenta"
                className={`${claseCampo} min-w-[220px] flex-1`}
                aria-label="Buscar campañas"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={soloConGasto}
                  onChange={(e) => setSoloConGasto(e.target.checked)}
                />
                Solo las que gastaron
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                    <th className="px-4 py-2 font-semibold">Campaña</th>
                    <th className="px-3 py-2 font-semibold">Dónde</th>
                    <th className="px-3 py-2 text-right font-semibold">Gasto</th>
                    <th className="px-3 py-2 text-right font-semibold">Compras</th>
                    <th className="px-4 py-2 font-semibold">Asignarle producto</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-2.5">
                        <span className="block max-w-[26rem] truncate" title={c.nombre}>
                          {c.nombre}
                        </span>
                        {!c.activa && (
                          <span className="mt-0.5 block text-[11px] text-muted">Pausada</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted">
                        {c.plataforma === "META" ? "Meta" : "TikTok"}
                        <span className="block max-w-[12rem] truncate" title={c.cuenta}>
                          {c.cuenta}
                        </span>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right tabular-nums ${
                          c.gasto > 0 ? "font-medium" : "text-muted"
                        }`}
                      >
                        {c.gasto > 0 ? money(c.gasto) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                        {c.compras > 0 ? c.compras.toLocaleString("es-EC") : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <select
                            defaultValue=""
                            disabled={guardando === c.id}
                            onChange={(e) => asignar(c, e.target.value)}
                            className={`${claseCampo} min-w-[200px]`}
                            aria-label={`Asignar producto a ${c.nombre}`}
                          >
                            <option value="">Elegir producto…</option>
                            {opciones.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.code} — {p.name}
                              </option>
                            ))}
                          </select>
                          {guardando === c.id && <Girando />}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {visibles.length === 0 && (
              <p className="px-4 py-4 text-sm text-muted">
                Ninguna campaña coincide con el filtro.
              </p>
            )}

            <p className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted">
              Asignar acá marca la campaña como corregida a mano, así la
              sincronización de cada cinco minutos no vuelve a soltarla. Si preferís que la app
              intente emparejarla sola de nuevo, se suelta desde Contenido → Gestión de campañas.
            </p>
          </>
        )}
      </section>

      {/* ----------------------- Productos sin campaña ----------------------- */}
      <section className="rounded border border-border bg-surface">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Productos sin ninguna campaña</h2>
          <p className="mt-0.5 text-xs text-muted">
            El otro lado del mismo problema: o nunca se pautaron, o su código no aparece en el
            nombre de ninguna campaña. En rentabilidad salen siempre en cero.
          </p>
        </div>

        {productos.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            Todos los productos tienen al menos una campaña conectada.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2 px-4 py-3">
            {productos.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/productos/${encodeURIComponent(p.code)}`}
                  className="flex items-baseline gap-2 rounded border border-border bg-surface-2 px-3 py-1.5 text-xs transition hover:bg-surface"
                >
                  <span className="font-medium">{p.code}</span>
                  <span className="max-w-[16rem] truncate text-muted">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
