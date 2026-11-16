"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Riesgo } from "@/lib/shopify-vs-ads-calculo";
import { CONFIRMACION_ALTA, CONFIRMACION_MEDIA, CPA_ALERTA, topDelMes } from "@/lib/shopify-vs-ads-calculo";
import EditorEtiquetas from "./etiquetas";

// Riesgo por producto.
//
// Es el artefacto de Emilia «Confirmación y CPA por producto – Bella» dentro de
// Jarvis, con sus mismas cuentas y su misma forma (revisado el 16-nov):
//   - arriba: pedidos, confirmación, pedidos de plataforma, gasto y CPA;
//   - una tarjeta por sección con cuántos productos y pedidos tiene, y la
//     barra que reparte los pedidos entre las secciones;
//   - las secciones por confirmación de la planilla: bajo (70% o más), medio
//     (57% a 69,99%), alto (menos de 57%), los testeos aparte y los que tienen
//     pauta pero ningún pedido;
//   - cada producto con pedidos, pedidos de plataforma, CPA (rojo pasando de
//     $6) y confirmación;
//   - un buscador de producto que recalcula todo.
// Lo que Jarvis le suma: el top 10 por utilidad, la utilidad de cada uno (con
// la economía de la Calculadora), el SKU y las etiquetas para marcar testeos,
// apagados u orgánicos sin salir de la pantalla.

export type FilaRiesgo = {
  clave: string;
  productId: string | null;
  nombre: string;
  sku: string | null;
  etiquetas: string[];
  /** Pedidos de la planilla de ventas en el período. */
  pedidos: number;
  confirmados: number;
  /** confirmados ÷ pedidos. null sin pedidos. */
  confirmacion: number | null;
  /** Compras que se atribuyen Meta + TikTok. */
  plataforma: number;
  gasto: number;
  /** gasto ÷ pedidos de la planilla. */
  cpa: number | null;
  cpaObjetivo: number | null;
  /** Del control, con la economía de la Calculadora. null si no aplica. */
  utilidad: number | null;
  /** Nombre de la planilla que todavía no está enlazado a un producto. */
  sinEnlazar: boolean;
  riesgo: Riesgo;
};

const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dinero2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entero = (n: number) => Math.round(n).toLocaleString("es-EC");
const pct2 = (n: number) => `${(n * 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Seccion = {
  id: "bajo" | "medio" | "alto" | "testeo";
  titulo: string;
  rango: string;
  /** Encabezado de la tabla y acento de la tarjeta. */
  cabecera: string;
  acento: string;
  barra: string;
};

const SECCIONES: Seccion[] = [
  {
    id: "bajo",
    titulo: "Bajo riesgo",
    rango: `${Math.round(CONFIRMACION_ALTA * 100)} % o más`,
    cabecera: "bg-emerald-700 text-white",
    acento: "border-t-emerald-600",
    barra: "bg-emerald-600",
  },
  {
    id: "medio",
    titulo: "Medio riesgo",
    rango: `${Math.round(CONFIRMACION_MEDIA * 100)} % a ${Math.round(CONFIRMACION_ALTA * 100) - 1},99 %`,
    cabecera: "bg-amber-700 text-white",
    acento: "border-t-amber-600",
    barra: "bg-amber-600",
  },
  {
    id: "alto",
    titulo: "Alto riesgo",
    rango: `menos de ${Math.round(CONFIRMACION_MEDIA * 100)} %`,
    cabecera: "bg-red-700 text-white",
    acento: "border-t-red-600",
    barra: "bg-red-600",
  },
  {
    id: "testeo",
    titulo: "Testeos",
    rango: "productos en prueba",
    cabecera: "bg-blue-600 text-white",
    acento: "border-t-blue-600",
    barra: "bg-blue-600",
  },
];

const tiene = (f: FilaRiesgo, e: string) => f.etiquetas.includes(e);

function Barra({ valor, max, clase }: { valor: number; max: number; clase: string }) {
  const ancho = max > 0 ? Math.max(2, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-surface-2 align-middle">
      <span className={`block h-full rounded-full ${clase}`} style={{ width: `${ancho}%` }} />
    </span>
  );
}

function Cpa({ f }: { f: FilaRiesgo }) {
  if (f.cpa == null)
    return <span className="text-muted">{!f.sinEnlazar && f.pedidos > 0 && f.gasto <= 0 ? "sin pauta" : "—"}</span>;
  const alto = f.cpa > CPA_ALERTA;
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
        alto ? "bg-critical-bg text-critical" : "bg-good-bg text-good"
      }`}
      title={f.cpaObjetivo != null ? `Objetivo en la Calculadora: ${dinero2(f.cpaObjetivo)}` : undefined}
    >
      {dinero2(f.cpa)}
    </span>
  );
}

function Confirmacion({ f }: { f: FilaRiesgo }) {
  if (f.confirmacion == null) return <span className="text-muted">—</span>;
  const clase =
    f.confirmacion >= CONFIRMACION_ALTA ? "bg-emerald-600" : f.confirmacion >= CONFIRMACION_MEDIA ? "bg-amber-600" : "bg-red-600";
  return (
    <span className="inline-flex items-center justify-end gap-2" title={`${entero(f.confirmados)} de ${entero(f.pedidos)} confirmados`}>
      <Barra valor={f.confirmacion} max={1} clase={clase} />
      <span className="w-14 text-right tabular-nums">{pct2(f.confirmacion)}</span>
    </span>
  );
}

const thBase = "px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted";
const th = `${thBase} text-right`;
const thIzq = `${thBase} text-left`;
const td = "px-3 py-2 text-right tabular-nums";

function Tabla({
  titulo,
  rango,
  cabecera,
  filas,
  maxPedidos,
  editable,
  vacio,
}: {
  titulo: string;
  rango: string;
  cabecera: string;
  filas: FilaRiesgo[];
  maxPedidos: number;
  editable: boolean;
  vacio: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className={`flex items-center justify-between px-4 py-2.5 ${cabecera}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          {titulo} <span className="ml-1 text-xs font-normal opacity-80">{filas.length}</span>
        </h3>
        <span className="text-xs opacity-90">{rango}</span>
      </div>
      {filas.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted">{vacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className={thIzq}>Producto</th>
                <th className={th}>Pedidos</th>
                <th className={th}>Pedidos plat.</th>
                <th className={th}>CPA</th>
                <th className={th}>Confirmación</th>
                <th className={th}>Utilidad</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.clave} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-left">
                    <span className="font-medium text-foreground">{f.nombre}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                      {f.sku && <span>SKU {f.sku}</span>}
                      {f.sinEnlazar && (
                        <Link href="/dashboard/control?vista=enlazar" className="text-warning underline-offset-2 hover:underline">
                          sin enlazar: sin gasto ni etiquetas hasta enlazarlo
                        </Link>
                      )}
                    </span>
                    {f.productId && (
                      <span className="mt-0.5 block">
                        <EditorEtiquetas productId={f.productId} etiquetas={f.etiquetas} editable={editable} />
                      </span>
                    )}
                  </td>
                  <td className={td}>
                    <span className="inline-flex items-center justify-end gap-2">
                      <Barra valor={f.pedidos} max={maxPedidos} clase="bg-muted/50" />
                      <span className="w-12 text-right font-semibold text-foreground">{entero(f.pedidos)}</span>
                    </span>
                  </td>
                  <td className={`${td} text-muted`}>{f.plataforma > 0 ? entero(f.plataforma) : "—"}</td>
                  <td className={td}>
                    <Cpa f={f} />
                  </td>
                  <td className={td}>
                    <Confirmacion f={f} />
                  </td>
                  <td
                    className={`${td} ${
                      f.utilidad == null ? "text-muted" : f.utilidad >= 0 ? "text-good" : "text-critical"
                    }`}
                  >
                    {f.utilidad == null ? "—" : dinero(f.utilidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function RiesgoProductos({
  filas,
  gastoSinProducto,
  editable,
}: {
  filas: FilaRiesgo[];
  /** Gasto de campañas sin producto: no entra en ninguna fila. */
  gastoSinProducto: number;
  editable: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");

  const vistas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    const visibles = q ? filas.filter((f) => sinTildes(`${f.nombre} ${f.sku ?? ""}`).includes(q)) : filas;
    const porPedidos = (a: FilaRiesgo, b: FilaRiesgo) => b.pedidos - a.pedidos || b.gasto - a.gasto;

    const testeo = visibles.filter((f) => tiene(f, "TESTEO")).sort(porPedidos);
    const apagados = visibles.filter((f) => tiene(f, "APAGADO") && !tiene(f, "TESTEO")).sort(porPedidos);
    const resto = visibles.filter((f) => !tiene(f, "TESTEO") && !tiene(f, "APAGADO"));
    const conPautaSinPedidos = resto
      .filter((f) => f.pedidos <= 0 && (f.gasto > 0 || f.plataforma > 0))
      .sort((a, b) => b.gasto - a.gasto);
    const enSecciones = resto.filter((f) => f.pedidos > 0);
    const grupos = {
      bajo: enSecciones.filter((f) => f.riesgo === "bajo").sort(porPedidos),
      medio: enSecciones.filter((f) => f.riesgo === "medio").sort(porPedidos),
      alto: enSecciones.filter((f) => f.riesgo === "alto").sort(porPedidos),
      testeo,
    };

    const suma = (l: FilaRiesgo[], k: "pedidos" | "confirmados" | "plataforma" | "gasto") =>
      l.reduce((t, f) => t + f[k], 0);
    // Los totales cuentan todo lo visible, también apagados y sin pedidos: es
    // la foto del período, como la del archivo de Emilia.
    const pedidos = suma(visibles, "pedidos");
    const confirmados = suma(visibles, "confirmados");
    const gasto = suma(visibles, "gasto") + (q ? 0 : gastoSinProducto);
    return {
      grupos,
      apagados,
      conPautaSinPedidos,
      top: topDelMes(
        enSecciones.filter((f) => f.utilidad != null).map((f) => ({ ...f, utilidad: f.utilidad as number })),
      ),
      total: {
        pedidos,
        confirmados,
        confirmacion: pedidos > 0 ? confirmados / pedidos : null,
        plataforma: suma(visibles, "plataforma"),
        gasto,
        cpa: pedidos > 0 && gasto > 0 ? gasto / pedidos : null,
      },
      maxPedidos: Math.max(1, ...visibles.map((f) => f.pedidos)),
      filtrando: q.length > 0,
    };
  }, [filas, busqueda, gastoSinProducto]);

  const { grupos, total } = vistas;
  const pedidosEnSecciones = SECCIONES.reduce((t, s) => t + grupos[s.id].reduce((a, f) => a + f.pedidos, 0), 0);

  return (
    <div className="flex flex-col gap-5">
      {/* --------------------------- Lo grande --------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Pedidos", valor: entero(total.pedidos), nota: "de la planilla de ventas" },
          {
            label: "Confirmación",
            valor: total.confirmacion == null ? "—" : pct2(total.confirmacion),
            nota: `${entero(total.confirmados)} confirmados`,
            tono:
              total.confirmacion == null
                ? ""
                : total.confirmacion >= CONFIRMACION_ALTA
                  ? "text-good"
                  : total.confirmacion >= CONFIRMACION_MEDIA
                    ? "text-warning"
                    : "text-critical",
          },
          { label: "Pedidos plataforma", valor: entero(total.plataforma), nota: "Meta + TikTok" },
          { label: "Gasto", valor: dinero2(total.gasto), nota: vistas.filtrando ? "de lo buscado" : "Meta + TikTok" },
          {
            label: "CPA",
            valor: total.cpa == null ? "—" : dinero2(total.cpa),
            nota: "gasto ÷ pedidos",
            tono: total.cpa != null && total.cpa > CPA_ALERTA ? "text-critical" : "",
          },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{x.label}</p>
            <p className={`mt-1 text-3xl font-semibold tabular-nums ${x.tono || "text-foreground"}`}>{x.valor}</p>
            <p className="mt-0.5 text-xs text-muted">{x.nota}</p>
          </div>
        ))}
      </div>

      {/* ------------------------- Las secciones ------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SECCIONES.map((s) => {
          const l = grupos[s.id];
          const ped = l.reduce((a, f) => a + f.pedidos, 0);
          return (
            <a
              key={s.id}
              href={`#riesgo-${s.id}`}
              className={`rounded-xl border border-border border-t-4 bg-surface p-4 transition-colors hover:bg-surface-2 ${s.acento}`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {s.titulo} · {s.rango}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {l.length}{" "}
                <span className="text-sm font-normal text-muted">{l.length === 1 ? "producto" : "productos"}</span>
              </p>
              <p className="text-xs text-muted">{entero(ped)} pedidos</p>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={`block h-full rounded-full ${s.barra}`}
                  style={{ width: `${total.pedidos > 0 ? (ped / total.pedidos) * 100 : 0}%` }}
                />
              </span>
            </a>
          );
        })}
      </div>

      <div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
          {SECCIONES.map((s) => {
            const ped = grupos[s.id].reduce((a, f) => a + f.pedidos, 0);
            return (
              <span
                key={s.id}
                className={s.barra}
                style={{ width: `${pedidosEnSecciones > 0 ? (ped / pedidosEnSecciones) * 100 : 0}%` }}
                title={`${s.titulo}: ${entero(ped)} pedidos`}
              />
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-muted">
          Bajo + medio + alto{" "}
          <b className="text-foreground">
            {entero(grupos.bajo.concat(grupos.medio, grupos.alto).reduce((a, f) => a + f.pedidos, 0))}
          </b>{" "}
          + testeos <b className="text-foreground">{entero(grupos.testeo.reduce((a, f) => a + f.pedidos, 0))}</b> ={" "}
          <b className="text-foreground">{entero(pedidosEnSecciones)}</b> pedidos · CPA mayor a {dinero2(CPA_ALERTA)} en
          rojo
          {vistas.apagados.length > 0 && <> · {vistas.apagados.length} apagados aparte</>}
        </p>
      </div>

      {/* ---------------------------- Buscador ---------------------------- */}
      <label className="flex max-w-md items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <span className="text-xs text-muted">Producto</span>
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Escribe el nombre o el SKU"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
        />
      </label>

      {/* ----------------------------- Top 10 ----------------------------- */}
      {!vistas.filtrando && vistas.top.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Top 10 del período</h2>
            <p className="mt-0.5 text-xs text-muted">
              Los que más utilidad dejaron (con la economía de la Calculadora), con su confirmación y su CPA.
            </p>
          </div>
          <ol className="grid gap-px bg-border sm:grid-cols-2">
            {vistas.top.map((f, i) => (
              <li key={f.clave} className="flex items-center gap-3 bg-surface px-4 py-2.5">
                <span className="w-6 text-lg font-semibold tabular-nums text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{f.nombre}</p>
                  <p className="text-[11px] text-muted">
                    {entero(f.pedidos)} pedidos · confirma {f.confirmacion == null ? "—" : pct2(f.confirmacion)} · CPA{" "}
                    {f.cpa == null ? "—" : dinero2(f.cpa)}
                  </p>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${f.utilidad >= 0 ? "text-good" : "text-critical"}`}>
                  {dinero(f.utilidad)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ---------------------------- Secciones ---------------------------- */}
      {SECCIONES.map((s) => (
        <div key={s.id} id={`riesgo-${s.id}`} className="scroll-mt-4">
          <Tabla
            titulo={s.titulo}
            rango={s.rango}
            cabecera={s.cabecera}
            filas={grupos[s.id]}
            maxPedidos={vistas.maxPedidos}
            editable={editable}
            vacio={
              s.id === "testeo"
                ? "Ningún producto marcado como Testeo. Se marcan con «+ etiqueta» en cualquier fila."
                : "Ninguno en este período."
            }
          />
        </div>
      ))}

      {vistas.conPautaSinPedidos.length > 0 && (
        <Tabla
          titulo="Con pauta, sin pedidos"
          rango="no aparecen en la planilla de ventas"
          cabecera="bg-zinc-600 text-white"
          filas={vistas.conPautaSinPedidos}
          maxPedidos={vistas.maxPedidos}
          editable={editable}
          vacio=""
        />
      )}

      {vistas.apagados.length > 0 && (
        <Tabla
          titulo="Apagados"
          rango="marcados como Apagado"
          cabecera="bg-zinc-500 text-white"
          filas={vistas.apagados}
          maxPedidos={vistas.maxPedidos}
          editable={editable}
          vacio=""
        />
      )}

      <details className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-foreground">Cómo se calculan los números</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
          <li>
            <b className="text-foreground">Pedidos y confirmación:</b> la planilla de ventas del equipo (Seguimiento de
            pedidos), todos los estados. Confirmación = confirmados ÷ pedidos del período elegido.
          </li>
          <li>
            <b className="text-foreground">Secciones:</b> bajo riesgo confirma {Math.round(CONFIRMACION_ALTA * 100)}% o más;
            medio, de {Math.round(CONFIRMACION_MEDIA * 100)}% a 69,99%; alto, menos de{" "}
            {Math.round(CONFIRMACION_MEDIA * 100)}%. Los marcados como Testeo van aparte y no entran en las secciones.
          </li>
          <li>
            <b className="text-foreground">Pedidos de plataforma y gasto:</b> Meta + TikTok, por las campañas de cada
            producto. Las cuentas que venden por WhatsApp no entran.
          </li>
          <li>
            <b className="text-foreground">CPA:</b> gasto ÷ pedidos de la planilla. En rojo cuando pasa de{" "}
            {dinero2(CPA_ALERTA)}. Pasando el mouse se ve el objetivo de la Calculadora.
          </li>
          <li>
            <b className="text-foreground">Utilidad:</b> la del Control publicitario, con la economía de la Calculadora de
            precios.
          </li>
          <li>
            <b className="text-foreground">Sin enlazar:</b> nombres de la planilla que todavía no tienen producto en Jarvis.
            Su confirmación ya cuenta; el gasto y las etiquetas aparecen al enlazarlos en «Enlazar pedidos».
            {gastoSinProducto > 0 && (
              <> Hay {dinero(gastoSinProducto)} de campañas sin producto que suman al gasto total pero a ninguna fila.</>
            )}
          </li>
        </ul>
      </details>
    </div>
  );
}
