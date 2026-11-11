"use client";

import { Fragment, useMemo, useState } from "react";
import type { ShopifyVsAds, FilaProductoCuadre } from "@/lib/shopify-vs-ads";
import type { Cuadre, EstadoCuadre } from "@/lib/shopify-vs-ads-calculo";
import { DIFERENCIA_ACEPTABLE } from "@/lib/shopify-vs-ads-calculo";
import EditorEtiquetas from "./etiquetas";

// Shopify contra Meta y TikTok.
//
// Es el archivo que Fabrizio armó con Claude y mostró el 10-nov, dentro de
// Jarvis y sin bajar reportes a mano: cuántos pedidos llegaron a Shopify,
// cuántos dice cada plataforma, la diferencia, el factor y los dos CPA —el
// que muestra el administrador de anuncios y el real—, con el objetivo al lado.
// Primero el día a día (lo que él mira cada mañana) y después cada producto.

const dinero2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const entero = (n: number) => Math.round(n).toLocaleString("es-EC");
const conSigno = (n: number) => (n > 0 ? `+${entero(n)}` : entero(n));
const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)}%`);
const pctSimple = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const factorTxt = (n: number | null) => (n == null ? "—" : n.toFixed(2).replace(".", ","));

function diaCorto(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("es-EC", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const TONO: Record<Exclude<EstadoCuadre, null>, string> = {
  bien: "bg-good-bg text-good",
  vigilar: "bg-pending-bg text-warning",
  mal: "bg-critical-bg text-critical",
};

function Factor({ c }: { c: Cuadre }) {
  if (c.estado == null)
    return <span className="text-muted">{c.shopify > 0 && c.gasto <= 0 ? "sin pauta" : "—"}</span>;
  return (
    <span
      className={`inline-block rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${TONO[c.estado]}`}
      title={
        c.factor == null
          ? "La plataforma reporta compras y Shopify no tiene pedidos"
          : `Por cada pedido de Shopify la plataforma reporta ${factorTxt(c.factor)}`
      }
    >
      {c.factor == null ? "sin Shopify" : factorTxt(c.factor)}
    </span>
  );
}

function CpaReal({ c, objetivo }: { c: Cuadre; objetivo: number | null }) {
  if (c.cpaReal == null) return <span className="text-muted">—</span>;
  const tono = objetivo == null ? "text-foreground" : c.cpaReal <= objetivo ? "text-good" : "text-critical";
  return (
    <span>
      <span className={`font-semibold ${tono}`}>{dinero2(c.cpaReal)}</span>
      {objetivo != null && (
        <span className="block rounded bg-surface-2 px-1 text-[10px] font-normal text-muted">
          objetivo {dinero2(objetivo)}
        </span>
      )}
    </span>
  );
}

const th = "px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted";
const td = "px-3 py-2 text-right tabular-nums";

export default function CuadreShopifyAds({
  datos,
  editable,
}: {
  datos: ShopifyVsAds;
  editable: boolean;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [soloMal, setSoloMal] = useState(false);
  const t = datos.total;

  const productos = useMemo(
    () => (soloMal ? datos.productos.filter((p) => p.estado === "mal" || p.estado === "vigilar") : datos.productos),
    [datos.productos, soloMal],
  );

  const diasDe = (p: FilaProductoCuadre) => datos.filas.filter((f) => f.productId === p.productId);

  return (
    <div className="flex flex-col gap-5">
      {/* --------------------------- Lo grande --------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Pedidos en Shopify", valor: entero(t.shopify), nota: "lo que llegó de verdad" },
          {
            label: "Dicen las plataformas",
            valor: entero(t.plataforma),
            nota: `Meta ${entero(t.meta)} · TikTok ${entero(t.tiktok)}`,
          },
          {
            label: "Diferencia",
            valor: conSigno(t.diferencia),
            nota: t.factor == null ? "—" : `factor ${factorTxt(t.factor)} · ${pct(t.porcentaje)}`,
            tono: t.estado ? TONO[t.estado] : "",
          },
          {
            label: "CPA plataforma → real",
            valor: t.cpaReal == null ? "—" : dinero2(t.cpaReal),
            nota: t.cpaPlataforma == null ? "sin compras de plataforma" : `la plataforma dice ${dinero2(t.cpaPlataforma)}`,
          },
          {
            label: "Equipo de ventas",
            valor: entero(t.ventas),
            nota: t.confirmacion == null ? "sin planilla en el período" : `${pctSimple(t.confirmacion)} confirmados`,
          },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{x.label}</p>
            <p className={`mt-1 inline-block rounded-md text-2xl font-semibold tabular-nums ${x.tono ? `px-1.5 ${x.tono}` : "text-foreground"}`}>
              {x.valor}
            </p>
            <p className="mt-0.5 text-xs text-muted">{x.nota}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
        <b className="text-foreground">Cómo leer el factor:</b> plataforma ÷ Shopify. 1,00 es que coinciden; 1,30 es que
        Meta y TikTok reportan un 30% más de compras de las que llegaron. Verde hasta ±{Math.round(DIFERENCIA_ACEPTABLE * 100)}%
        (aceptable), ámbar hasta ±25% (vigilar), rojo más allá (revisar el píxel). El CPA real es gasto ÷ pedidos de
        Shopify; es con ese con el que se decide escalar.
        {datos.avisos.gastoFueraWeb > 0 && (
          <>
            {" "}
            <b className="text-warning">
              No entran {dinero(datos.avisos.gastoFueraWeb)} de cuentas que venden por WhatsApp
            </b>{" "}
            ({datos.avisos.cuentasFueraWeb.join(", ")}): gastan pero no reportan compras web, e inflarían el CPA de
            plataforma.
          </>
        )}
      </p>

      {/* ----------------------------- Por día ----------------------------- */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Día por día</h2>
          <p className="mt-0.5 text-xs text-muted">
            Todos los productos juntos. Hoy se va llenando en vivo; las plataformas ajustan sus compras durante uno o dos
            días.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className={`${th} text-left`}>Día</th>
                <th className={th}>Shopify</th>
                <th className={th}>Meta</th>
                <th className={th}>TikTok</th>
                <th className={th}>Diferencia</th>
                <th className={th}>Factor</th>
                <th className={th}>Gasto</th>
                <th className={th}>CPA plataforma</th>
                <th className={th}>CPA real</th>
                <th className={th}>Equipo ventas</th>
                <th className={th}>Confirmación</th>
              </tr>
            </thead>
            <tbody>
              {datos.dias.map((d) => (
                <tr key={d.fecha} className="border-t border-border">
                  <td className="px-3 py-2 text-left capitalize text-foreground">{diaCorto(d.fecha)}</td>
                  <td className={`${td} font-semibold text-foreground`}>{entero(d.shopify)}</td>
                  <td className={td}>{entero(d.meta)}</td>
                  <td className={td}>{entero(d.tiktok)}</td>
                  <td className={td}>
                    {conSigno(d.diferencia)} <span className="text-[11px] text-muted">{pct(d.porcentaje)}</span>
                  </td>
                  <td className={td}>
                    <Factor c={d} />
                  </td>
                  <td className={td}>{dinero(d.gasto)}</td>
                  <td className={`${td} text-muted`}>{d.cpaPlataforma == null ? "—" : dinero2(d.cpaPlataforma)}</td>
                  <td className={`${td} font-semibold text-foreground`}>{d.cpaReal == null ? "—" : dinero2(d.cpaReal)}</td>
                  <td className={td}>{d.ventas ? entero(d.ventas) : "—"}</td>
                  <td className={td}>{pctSimple(d.confirmacion)}</td>
                </tr>
              ))}
              {datos.dias.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-muted">
                    Sin datos en este período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* --------------------------- Por producto --------------------------- */}
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Producto por producto</h2>
            <p className="mt-0.5 text-xs text-muted">Un clic en el producto abre su día a día.</p>
          </div>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={soloMal} onChange={(e) => setSoloMal(e.target.checked)} />
            Solo los que no cuadran
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className={`${th} text-left`}>Producto</th>
                <th className={th}>Shopify</th>
                <th className={th}>Meta</th>
                <th className={th}>TikTok</th>
                <th className={th}>Diferencia</th>
                <th className={th}>Factor</th>
                <th className={th}>Gasto</th>
                <th className={th}>CPA plataforma</th>
                <th className={th}>CPA real</th>
                <th className={th}>Equipo ventas</th>
                <th className={th}>Confirmación</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const clave = p.productId ?? "__sin__";
                const abiertoEste = abierto === clave;
                return (
                  <Fragment key={clave}>
                    <tr className="border-t border-border align-top">
                      <td className="px-3 py-2 text-left">
                        <button
                          type="button"
                          onClick={() => setAbierto(abiertoEste ? null : clave)}
                          className="text-left font-medium text-foreground hover:text-accent-strong"
                        >
                          {abiertoEste ? "▾ " : "▸ "}
                          {p.nombre}
                        </button>
                        <span className="block text-[11px] text-muted">
                          {[p.sku ? `SKU ${p.sku}` : null, p.codigo || null].filter(Boolean).join(" · ")}
                        </span>
                        <span className="mt-0.5 block">
                          <EditorEtiquetas productId={p.productId} etiquetas={p.etiquetas} editable={editable} />
                        </span>
                      </td>
                      <td className={`${td} font-semibold text-foreground`}>{entero(p.shopify)}</td>
                      <td className={td}>{entero(p.meta)}</td>
                      <td className={td}>{entero(p.tiktok)}</td>
                      <td className={td}>
                        {conSigno(p.diferencia)} <span className="text-[11px] text-muted">{pct(p.porcentaje)}</span>
                      </td>
                      <td className={td}>
                        <Factor c={p} />
                      </td>
                      <td className={td}>{dinero(p.gasto)}</td>
                      <td className={`${td} text-muted`}>{p.cpaPlataforma == null ? "—" : dinero2(p.cpaPlataforma)}</td>
                      <td className={td}>
                        <CpaReal c={p} objetivo={p.cpaObjetivo} />
                      </td>
                      <td className={td}>{p.ventas ? entero(p.ventas) : "—"}</td>
                      <td className={td}>{pctSimple(p.confirmacion)}</td>
                    </tr>
                    {abiertoEste &&
                      diasDe(p).map((d) => (
                        <tr key={`${clave}-${d.fecha}`} className="border-t border-border/60 bg-surface-2/50 text-xs">
                          <td className="px-3 py-1.5 pl-8 text-left capitalize text-muted">{diaCorto(d.fecha)}</td>
                          <td className={`${td} py-1.5`}>{entero(d.shopify)}</td>
                          <td className={`${td} py-1.5`}>{entero(d.meta)}</td>
                          <td className={`${td} py-1.5`}>{entero(d.tiktok)}</td>
                          <td className={`${td} py-1.5`}>
                            {conSigno(d.diferencia)} <span className="text-muted">{pct(d.porcentaje)}</span>
                          </td>
                          <td className={`${td} py-1.5`}>
                            <Factor c={d} />
                          </td>
                          <td className={`${td} py-1.5`}>{dinero(d.gasto)}</td>
                          <td className={`${td} py-1.5 text-muted`}>
                            {d.cpaPlataforma == null ? "—" : dinero2(d.cpaPlataforma)}
                          </td>
                          <td className={`${td} py-1.5`}>{d.cpaReal == null ? "—" : dinero2(d.cpaReal)}</td>
                          <td className={`${td} py-1.5`}>{d.ventas ? entero(d.ventas) : "—"}</td>
                          <td className={`${td} py-1.5`}>{pctSimple(d.confirmacion)}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
