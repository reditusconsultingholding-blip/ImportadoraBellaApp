"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  UMBRALES_RIESGO,
  clasificarRiesgo,
  topDelMes,
  type CausaAlto,
  type Clasificacion,
  type UmbralesRiesgo,
} from "@/lib/shopify-vs-ads-calculo";
import EditorEtiquetas from "./etiquetas";

// Riesgo por producto y Testeos.
//
// Es el tablero «Comercial vs Pauta» de Emilia dentro de Jarvis, con sus
// mismas reglas (revisado el 18-nov):
//   - Riesgo: solo productos con pauta y sin la etiqueta Testeo. Alto si
//     confirma menos de 65 % o el CPA real pasa de $8, separado por causa;
//     medio si no llega a 70 %, el CPA pasa de $5, tiene menos de 30 pedidos o
//     la plataforma cuenta más de 1,33 veces sus pedidos; bajo si cumple todo.
//     Dentro de cada sección, del CPA real más bajo al más alto.
//   - Testeos: los productos marcados como Testeo, con la misma regla pero sin
//     la de volumen. Un testeo con pauta y sin pedidos es alto: no hay cómo
//     medirlo.
//   - Los umbrales se mueven desde la pantalla (quedan en ese navegador).
// Lo que Jarvis le suma: la utilidad de cada producto con la economía de la
// Calculadora, el SKU, las etiquetas editables y el top 10 por utilidad.

export type FilaRiesgo = {
  clave: string;
  productId: string | null;
  nombre: string;
  sku: string | null;
  etiquetas: string[];
  /** Pedidos del área comercial (la planilla de ventas) en el período. */
  pedidos: number;
  confirmados: number;
  /** confirmados ÷ pedidos. null sin pedidos. */
  confirmacion: number | null;
  /** Compras que se atribuyen Meta + TikTok. */
  plataforma: number;
  /** Pedidos de Shopify: la base del factor «plataforma cuenta N×». null si no aplica. */
  shopify: number | null;
  meta: number;
  tiktok: number;
  gasto: number;
  /** gasto ÷ pedidos de la planilla. */
  cpa: number | null;
  cpaObjetivo: number | null;
  /** Del control, con la economía de la Calculadora. null si no aplica. */
  utilidad: number | null;
  /** Nombre de la planilla que todavía no está enlazado a un producto. */
  sinEnlazar: boolean;
};

type Clasificada = FilaRiesgo & Clasificacion;

const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dinero2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entero = (n: number) => Math.round(n).toLocaleString("es-EC");
const pct2 = (n: number) => `${(n * 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type IdSeccion = "alto" | "medio" | "bajo";

const SECCIONES: { id: IdSeccion; titulo: string; cabecera: string; acento: string; barra: string }[] = [
  { id: "alto", titulo: "Riesgo alto", cabecera: "bg-red-700 text-white", acento: "border-t-red-600", barra: "bg-red-600" },
  { id: "medio", titulo: "Riesgo medio", cabecera: "bg-amber-700 text-white", acento: "border-t-amber-600", barra: "bg-amber-600" },
  { id: "bajo", titulo: "Riesgo bajo", cabecera: "bg-emerald-700 text-white", acento: "border-t-emerald-600", barra: "bg-emerald-600" },
];

const CAUSAS: { id: CausaAlto; titulo: string; nota: string }[] = [
  {
    id: "confirmacion",
    titulo: "Mala confirmación",
    nota: "problema de logística o de producto: por más barato que salga el pedido, no se concreta",
  },
  { id: "cpa", titulo: "Buena confirmación, CPA alto", nota: "el producto convierte, el problema es el costo de adquisición" },
  // Los que tienen pauta y ningún pedido van aquí, como en el tablero: no hay
  // confirmación ni CPA que medir.
  { id: "ambas", titulo: "Confirmación y CPA malos", nota: "los dos problemas juntos" },
];
const causaDe = (f: Clasificada) => (f.causa === "sinDatos" ? "ambas" : f.causa);

const tiene = (f: FilaRiesgo, e: string) => f.etiquetas.includes(e);

/** Los umbrales movidos en este navegador. */
const CLAVE_UMBRALES = "umbrales-riesgo-18nov";

function Barra({ valor, max, clase }: { valor: number; max: number; clase: string }) {
  const ancho = max > 0 ? Math.max(2, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <span className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-surface-2 align-middle">
      <span className={`block h-full rounded-full ${clase}`} style={{ width: `${ancho}%` }} />
    </span>
  );
}

function Cpa({ f, u }: { f: FilaRiesgo; u: UmbralesRiesgo }) {
  if (f.cpa == null) return <span className="text-muted">—</span>;
  const tono =
    f.cpa > u.cpaAlto ? "bg-critical-bg text-critical" : f.cpa > u.cpaMedio ? "bg-warning/10 text-warning" : "bg-good-bg text-good";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${tono}`}
      title={f.cpaObjetivo != null ? `Objetivo en la Calculadora: ${dinero2(f.cpaObjetivo)}` : undefined}
    >
      {dinero2(f.cpa)}
    </span>
  );
}

function Confirmacion({ f, u }: { f: FilaRiesgo; u: UmbralesRiesgo }) {
  if (f.confirmacion == null) return <span className="text-muted">—</span>;
  const clase =
    f.confirmacion >= u.confirmacionMedio
      ? "bg-emerald-600"
      : f.confirmacion >= u.confirmacionAlto
        ? "bg-amber-600"
        : "bg-red-600";
  return (
    <span className="inline-flex items-center justify-end gap-2" title={`${entero(f.confirmados)} de ${entero(f.pedidos)} confirmados`}>
      <Barra valor={f.confirmacion} max={1} clase={clase} />
      <span className="w-16 text-right tabular-nums">{pct2(f.confirmacion)}</span>
    </span>
  );
}

const thBase = "px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted";
const th = `${thBase} text-right`;
const thIzq = `${thBase} text-left`;
const td = "px-3 py-2 text-right tabular-nums";

/** Pone o quita la etiqueta Descartado, como el botón del tablero de Emilia. */
function BotonDescartar({ f, restaurar = false }: { f: FilaRiesgo; restaurar?: boolean }) {
  const router = useRouter();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!f.productId) return null;
  const alternar = async () => {
    setGuardando(true);
    setError(null);
    const etiquetas = restaurar ? f.etiquetas.filter((e) => e !== "DESCARTADO") : [...f.etiquetas, "DESCARTADO"];
    try {
      const res = await fetch("/api/productos/etiquetas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: f.productId, etiquetas }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo guardar.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={alternar}
        disabled={guardando}
        className="rounded-md border border-border px-1.5 py-px text-[10px] font-medium text-muted hover:border-border-strong hover:text-foreground disabled:opacity-50"
      >
        {guardando ? "…" : restaurar ? "Restaurar" : "Descartar"}
      </button>
      {error && <span className="text-[10px] text-critical">{error}</span>}
    </span>
  );
}

function Fila({ f, u, maxPedidos, editable }: { f: Clasificada; u: UmbralesRiesgo; maxPedidos: number; editable: boolean }) {
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">{f.nombre}</span>
          {editable && <BotonDescartar f={f} />}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          {f.sku && <span>SKU {f.sku}</span>}
          {f.plataforma > 0 && (
            <span>
              plataformas {entero(f.plataforma)} (Meta {entero(f.meta)} · TikTok {entero(f.tiktok)})
            </span>
          )}
          {f.sinEnlazar && (
            <Link href="/dashboard/control?vista=enlazar" className="text-warning underline-offset-2 hover:underline">
              sin enlazar: sin gasto ni etiquetas hasta enlazarlo
            </Link>
          )}
        </span>
        {f.motivos.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {f.motivos.map((m) => (
              <span
                key={m.texto}
                className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                  f.riesgo === "bajo"
                    ? "bg-good-bg text-good"
                    : m.grave
                      ? "bg-critical-bg text-critical"
                      : "bg-warning/10 text-warning"
                }`}
              >
                {m.texto}
              </span>
            ))}
          </span>
        )}
        {f.productId && (
          <span className="mt-1 block">
            <EditorEtiquetas productId={f.productId} etiquetas={f.etiquetas} editable={editable} />
          </span>
        )}
      </td>
      <td className={`${td} text-foreground`}>{f.gasto > 0 ? dinero(f.gasto) : "—"}</td>
      <td className={td}>
        <span className="inline-flex items-center justify-end gap-2">
          <Barra valor={f.pedidos} max={maxPedidos} clase="bg-muted/50" />
          <span className="w-12 text-right font-semibold text-foreground">{entero(f.pedidos)}</span>
        </span>
      </td>
      <td className={`${td} text-muted`}>{f.plataforma > 0 ? entero(f.plataforma) : "—"}</td>
      <td className={td}>
        <Cpa f={f} u={u} />
      </td>
      <td className={td}>
        <Confirmacion f={f} u={u} />
      </td>
      <td className={`${td} ${f.utilidad == null ? "text-muted" : f.utilidad >= 0 ? "text-good" : "text-critical"}`}>
        {f.utilidad == null ? "—" : dinero(f.utilidad)}
      </td>
    </tr>
  );
}

function Tabla({
  titulo,
  nota,
  cabecera,
  grupos,
  u,
  maxPedidos,
  editable,
  vacio,
}: {
  titulo: string;
  nota: string;
  cabecera: string;
  /** Una o varias tandas de filas, cada una con su subtítulo opcional. */
  grupos: { titulo?: string; nota?: string; filas: Clasificada[] }[];
  u: UmbralesRiesgo;
  maxPedidos: number;
  editable: boolean;
  vacio: string;
}) {
  const n = grupos.reduce((t, g) => t + g.filas.length, 0);
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${cabecera}`}>
        <h3 className="text-sm font-semibold uppercase tracking-wide">
          {titulo} <span className="ml-1 text-xs font-normal opacity-80">{n}</span>
        </h3>
        <span className="text-xs opacity-90">{nota}</span>
      </div>
      {n === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted">{vacio}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface-2">
              <tr>
                <th className={thIzq}>Producto</th>
                <th className={th}>Gasto</th>
                <th className={th}>Pedidos comercial</th>
                <th className={th}>Pedidos plat.</th>
                <th className={th}>CPA real</th>
                <th className={th}>Confirmación</th>
                <th className={th}>Utilidad</th>
              </tr>
            </thead>
            {grupos
              .filter((g) => g.filas.length > 0)
              .map((g, i) => (
                <tbody key={g.titulo ?? i}>
                  {g.titulo && (
                    <tr className="border-t border-border bg-surface-2/60">
                      <td colSpan={7} className="px-3 py-1.5 text-left">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-critical">
                          {g.titulo} <span className="font-normal text-muted">{g.filas.length}</span>
                        </span>
                        {g.nota && <span className="ml-2 text-[11px] text-muted">{g.nota}</span>}
                      </td>
                    </tr>
                  )}
                  {g.filas.map((f) => (
                    <Fila key={f.clave} f={f} u={u} maxPedidos={maxPedidos} editable={editable} />
                  ))}
                </tbody>
              ))}
          </table>
        </div>
      )}
    </section>
  );
}

function EditorUmbrales({ u, cambiar }: { u: UmbralesRiesgo; cambiar: (u: UmbralesRiesgo) => void }) {
  const campos: { k: keyof UmbralesRiesgo; label: string; pct?: boolean; paso: number }[] = [
    { k: "confirmacionAlto", label: "Alto: confirma menos de (%)", pct: true, paso: 1 },
    { k: "cpaAlto", label: "Alto: CPA real sobre ($)", paso: 0.5 },
    { k: "confirmacionMedio", label: "Medio: confirma menos de (%)", pct: true, paso: 1 },
    { k: "cpaMedio", label: "Medio: CPA real sobre ($)", paso: 0.5 },
    { k: "pedidosMinimos", label: "Medio: menos pedidos que", paso: 1 },
    { k: "factorPlataforma", label: "Medio: plataforma cuenta más de (×)", paso: 0.01 },
    { k: "factorMinimoPedidos", label: "El factor se mira desde (pedidos Shopify)", paso: 1 },
  ];
  const distinto = (Object.keys(UMBRALES_RIESGO) as (keyof UmbralesRiesgo)[]).some((k) => u[k] !== UMBRALES_RIESGO[k]);
  return (
    <details className="rounded-xl border border-border bg-surface px-4 py-3 text-xs">
      <summary className="cursor-pointer font-medium text-foreground">
        Umbrales{distinto ? " (movidos en este navegador)" : ""}: alto {Math.round(u.confirmacionAlto * 100)} % /{" "}
        {dinero2(u.cpaAlto)} · medio {Math.round(u.confirmacionMedio * 100)} % / {dinero2(u.cpaMedio)} /{" "}
        {u.pedidosMinimos} pedidos / {u.factorPlataforma.toLocaleString("es-EC")}×
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {campos.map((c) => (
          <label key={c.k} className="flex flex-col gap-1 text-muted">
            {c.label}
            <input
              type="number"
              step={c.paso}
              value={c.pct ? Math.round(u[c.k] * 1000) / 10 : u[c.k]}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isFinite(v) || v < 0) return;
                cambiar({ ...u, [c.k]: c.pct ? v / 100 : v });
              }}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm tabular-nums text-foreground outline-none"
            />
          </label>
        ))}
      </div>
      {distinto && (
        <button
          type="button"
          onClick={() => cambiar(UMBRALES_RIESGO)}
          className="mt-3 text-xs font-medium text-accent-strong hover:underline"
        >
          Volver a los del tablero de Emilia
        </button>
      )}
    </details>
  );
}

export default function RiesgoProductos({
  filas,
  gastoSinProducto,
  editable,
  modo = "riesgo",
}: {
  filas: FilaRiesgo[];
  /** Gasto de campañas sin producto: no entra en ninguna fila. */
  gastoSinProducto: number;
  editable: boolean;
  /** «testeos»: solo los productos marcados como Testeo, sin la regla de volumen. */
  modo?: "riesgo" | "testeos";
}) {
  const [busqueda, setBusqueda] = useState("");
  const [u, setU] = useState<UmbralesRiesgo>(UMBRALES_RIESGO);
  // Los umbrales guardados se leen después de montar: el servidor no ve el
  // localStorage y decidirlo en el primer dibujado haría que servidor y
  // navegador pinten cosas distintas.
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_UMBRALES);
      if (guardado) {
        const v = { ...UMBRALES_RIESGO, ...JSON.parse(guardado) } as UmbralesRiesgo;
        const t = window.setTimeout(() => setU(v), 0);
        return () => window.clearTimeout(t);
      }
    } catch {
      /* sin almacenamiento: los de Emilia */
    }
  }, []);
  const cambiarUmbrales = (v: UmbralesRiesgo) => {
    setU(v);
    try {
      window.localStorage.setItem(CLAVE_UMBRALES, JSON.stringify(v));
    } catch {
      /* sin almacenamiento: vale hasta recargar */
    }
  };

  const vistas = useMemo(() => {
    const q = sinTildes(busqueda.trim());
    const visibles = q ? filas.filter((f) => sinTildes(`${f.nombre} ${f.sku ?? ""}`).includes(q)) : filas;
    const clasificar = (f: FilaRiesgo): Clasificada => ({
      ...f,
      ...clasificarRiesgo({ ...f, testeo: tiene(f, "TESTEO") }, u),
    });
    // Del CPA real más bajo al más alto, como el tablero; sin CPA al final.
    const porCpa = (a: Clasificada, b: Clasificada) =>
      (a.cpa ?? Number.POSITIVE_INFINITY) - (b.cpa ?? Number.POSITIVE_INFINITY) || b.gasto - a.gasto;

    const descartado = (f: FilaRiesgo) => tiene(f, "DESCARTADO");
    const testeosTodos = visibles.filter((f) => tiene(f, "TESTEO") && (f.gasto > 0 || f.pedidos > 0));
    const testeos = testeosTodos.filter((f) => !descartado(f));
    const apagados = visibles
      .filter((f) => tiene(f, "APAGADO") && !tiene(f, "TESTEO") && f.pedidos > 0)
      .map(clasificar)
      .sort(porCpa);
    const normales = visibles.filter((f) => !tiene(f, "TESTEO") && !tiene(f, "APAGADO"));
    // «Solo productos con pauta»: los que venden sin gasto van aparte.
    const sinPauta = normales
      .filter((f) => f.gasto <= 0 && f.pedidos > 0)
      .map(clasificar)
      .sort((a, b) => b.pedidos - a.pedidos);
    const conPauta = normales.filter((f) => f.gasto > 0 && !f.sinEnlazar);
    const base = modo === "testeos" ? testeos : conPauta.filter((f) => !descartado(f));
    const descartados = (modo === "testeos" ? testeosTodos : conPauta).filter(descartado).map(clasificar);
    const clasificadas = base.map(clasificar).filter((f) => f.riesgo !== "sinDatos");
    const grupos = {
      alto: clasificadas.filter((f) => f.riesgo === "alto").sort(porCpa),
      medio: clasificadas.filter((f) => f.riesgo === "medio").sort(porCpa),
      bajo: clasificadas.filter((f) => f.riesgo === "bajo").sort(porCpa),
    };

    const suma = (l: FilaRiesgo[], k: "pedidos" | "confirmados" | "plataforma" | "gasto") =>
      l.reduce((t, f) => t + f[k], 0);
    // Arriba, la foto del período: en riesgo, todo lo que ve el comercial y
    // todo el gasto; en testeos, solo los testeos.
    const delTotal = modo === "testeos" ? testeos : visibles;
    const pedidos = suma(delTotal, "pedidos");
    const confirmados = suma(delTotal, "confirmados");
    const gasto = suma(delTotal, "gasto") + (q || modo === "testeos" ? 0 : gastoSinProducto);
    return {
      grupos,
      descartados,
      apagados,
      sinPauta,
      nTesteos: testeos.length,
      top: topDelMes(
        clasificadas.filter((f) => f.utilidad != null).map((f) => ({ ...f, utilidad: f.utilidad as number })),
      ),
      total: {
        pedidos,
        confirmados,
        confirmacion: pedidos > 0 ? confirmados / pedidos : null,
        plataforma: suma(delTotal, "plataforma"),
        gasto,
        cpa: pedidos > 0 && gasto > 0 ? gasto / pedidos : null,
      },
      maxPedidos: Math.max(1, ...visibles.map((f) => f.pedidos)),
      filtrando: q.length > 0,
    };
  }, [filas, busqueda, gastoSinProducto, u, modo]);

  const sinEnlazar = filas.filter((f) => f.sinEnlazar && f.pedidos > 0);
  const { grupos, total } = vistas;
  const enSecciones = grupos.alto.length + grupos.medio.length + grupos.bajo.length;

  return (
    <div className="flex flex-col gap-5">
      {/* ----------------------------- Qué es ----------------------------- */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">{modo === "testeos" ? "Testeos" : "Riesgo por producto"}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {modo === "testeos" ? (
            <>
              Los productos marcados como <b>Testeo</b> (en cualquier fila, «+ etiqueta»), con la misma regla que el riesgo
              pero sin la de volumen: un testeo empieza con pocos pedidos. Con pauta y sin pedidos en el comercial es alto,
              porque no hay cómo medirlo. Que una campaña diga «TEST» en el nombre no hace que el producto esté en prueba.
            </>
          ) : (
            <>
              Solo productos con pauta, ordenados por CPA real de menor a mayor dentro de cada sección. <b>Alto:</b> confirma
              menos de {Math.round(u.confirmacionAlto * 100)} % o CPA real sobre {dinero2(u.cpaAlto)}; se separa por causa
              porque cada una pide una solución distinta. <b>Medio:</b> no llega a {Math.round(u.confirmacionMedio * 100)} %
              de confirmación o a un CPA de {dinero2(u.cpaMedio)}, tiene menos de {u.pedidosMinimos} pedidos, o la
              plataforma cuenta más de {u.factorPlataforma.toLocaleString("es-EC")} veces sus pedidos de Shopify (desde{" "}
              {u.factorMinimoPedidos} pedidos). <b>Bajo:</b> cumple
              todo. Los testeos no entran aquí:{" "}
              <Link href="/dashboard/control?vista=testeos" className="font-medium text-accent-strong hover:underline">
                se ven en su propia pestaña ({vistas.nTesteos}) →
              </Link>
            </>
          )}
        </p>
        {sinEnlazar.length > 0 && modo === "riesgo" && (
          <p className="mt-2 text-xs text-warning">
            {sinEnlazar.length} {sinEnlazar.length === 1 ? "nombre" : "nombres"} de la planilla sin enlazar (
            {sinEnlazar
              .slice(0, 4)
              .map((f) => f.nombre)
              .join(", ")}
            {sinEnlazar.length > 4 ? "…" : ""}): sus pedidos no suman a ningún producto.{" "}
            <Link href="/dashboard/control?vista=enlazar" className="font-medium underline">
              Enlazarlos
            </Link>
          </p>
        )}
      </section>

      {/* --------------------------- Lo grande --------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Pedidos comercial", valor: entero(total.pedidos), nota: "de la planilla de ventas" },
          {
            label: "Confirmación",
            valor: total.confirmacion == null ? "—" : pct2(total.confirmacion),
            nota: `${entero(total.confirmados)} confirmados`,
            tono:
              total.confirmacion == null
                ? ""
                : total.confirmacion >= u.confirmacionMedio
                  ? "text-good"
                  : total.confirmacion >= u.confirmacionAlto
                    ? "text-warning"
                    : "text-critical",
          },
          { label: "Pedidos plataforma", valor: entero(total.plataforma), nota: "Meta + TikTok" },
          { label: "Gasto", valor: dinero2(total.gasto), nota: vistas.filtrando ? "de lo buscado" : "Meta + TikTok, sin WhatsApp" },
          {
            label: "CPA real",
            valor: total.cpa == null ? "—" : dinero2(total.cpa),
            nota: "gasto ÷ pedidos del comercial",
            tono: total.cpa == null ? "" : total.cpa > u.cpaAlto ? "text-critical" : total.cpa > u.cpaMedio ? "text-warning" : "text-good",
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SECCIONES.map((s) => {
          const l = grupos[s.id];
          return (
            <a
              key={s.id}
              href={`#riesgo-${s.id}`}
              className={`rounded-xl border border-border border-t-4 bg-surface p-4 transition-colors hover:bg-surface-2 ${s.acento}`}
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{s.titulo}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-foreground">{l.length}</p>
              <p className="text-xs text-muted">
                {entero(l.reduce((a, f) => a + f.pedidos, 0))} pedidos · {dinero(l.reduce((a, f) => a + f.gasto, 0))} de gasto
              </p>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span
                  className={`block h-full rounded-full ${s.barra}`}
                  style={{ width: `${enSecciones > 0 ? (l.length / enSecciones) * 100 : 0}%` }}
                />
              </span>
            </a>
          );
        })}
      </div>

      <EditorUmbrales u={u} cambiar={cambiarUmbrales} />

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
      {modo === "riesgo" && !vistas.filtrando && vistas.top.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Top 10 del período</h2>
            <p className="mt-0.5 text-xs text-muted">
              Los que más utilidad dejaron (con la economía de la Calculadora), con su confirmación y su CPA real.
            </p>
          </div>
          <ol className="grid gap-px bg-border sm:grid-cols-2">
            {vistas.top.map((f, i) => (
              <li key={f.clave} className="flex items-center gap-3 bg-surface px-4 py-2.5">
                <span className="w-6 text-lg font-semibold tabular-nums text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{f.nombre}</p>
                  <p className="text-[11px] text-muted">
                    {entero(f.pedidos)} pedidos · confirma {f.confirmacion == null ? "—" : pct2(f.confirmacion)} · CPA real{" "}
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
            nota={
              s.id === "alto"
                ? `confirma menos de ${Math.round(u.confirmacionAlto * 100)} % o CPA real sobre ${dinero2(u.cpaAlto)}`
                : s.id === "medio"
                  ? `no cumple algún umbral`
                  : "cumple confirmación, CPA y volumen"
            }
            cabecera={s.cabecera}
            grupos={
              s.id === "alto"
                ? CAUSAS.map((c) => ({ titulo: c.titulo, nota: c.nota, filas: grupos.alto.filter((f) => causaDe(f) === c.id) }))
                : [{ filas: grupos[s.id] }]
            }
            u={u}
            maxPedidos={vistas.maxPedidos}
            editable={editable}
            vacio={
              modo === "testeos" && grupos.alto.length + grupos.medio.length + grupos.bajo.length === 0
                ? "Ningún producto marcado como Testeo con pauta o pedidos en el período."
                : "Ninguno en este período."
            }
          />
        </div>
      ))}

      {vistas.descartados.length > 0 && (
        <details className="rounded-xl border border-border bg-surface px-4 py-3 text-xs">
          <summary className="cursor-pointer font-medium text-foreground">Descartados ({vistas.descartados.length})</summary>
          <p className="mt-1 text-muted">No cuentan en las secciones. Restaurar los devuelve a su lugar.</p>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {vistas.descartados.map((f) => (
              <li key={f.clave} className="flex items-center justify-between gap-3 py-1.5">
                <span>
                  <span className="font-medium text-foreground">{f.nombre}</span>{" "}
                  <span className="text-muted">
                    {f.cpa != null ? `CPA real ${dinero2(f.cpa)}` : "sin CPA"} · {dinero(f.gasto)} de gasto
                  </span>
                </span>
                {editable && <BotonDescartar f={f} restaurar />}
              </li>
            ))}
          </ul>
        </details>
      )}

      {modo === "riesgo" && vistas.sinPauta.length > 0 && (
        <Tabla
          titulo="Con pedidos, sin pauta"
          nota="venden sin gasto en el período: no entran en el riesgo"
          cabecera="bg-zinc-600 text-white"
          grupos={[{ filas: vistas.sinPauta }]}
          u={u}
          maxPedidos={vistas.maxPedidos}
          editable={editable}
          vacio=""
        />
      )}

      {modo === "riesgo" && vistas.apagados.length > 0 && (
        <Tabla
          titulo="Apagados"
          nota="marcados como Apagado"
          cabecera="bg-zinc-500 text-white"
          grupos={[{ filas: vistas.apagados }]}
          u={u}
          maxPedidos={vistas.maxPedidos}
          editable={editable}
          vacio=""
        />
      )}

      <details className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-muted">
        <summary className="cursor-pointer font-medium text-foreground">Cómo se calculan los números</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
          <li>
            <b className="text-foreground">Pedidos y confirmación:</b> la planilla del área comercial (Seguimiento de
            pedidos), todos los estados. Confirmación = confirmados ÷ pedidos del período elegido.
          </li>
          <li>
            <b className="text-foreground">Pedidos de plataforma y gasto:</b> Meta + TikTok, por las campañas de cada
            producto. La cuenta de ventas por WhatsApp (CP2 - Top Ventas) no entra: sus campañas no traen compras web.
          </li>
          <li>
            <b className="text-foreground">CPA real:</b> gasto ÷ pedidos del comercial. Verde hasta {dinero2(u.cpaMedio)},
            ámbar hasta {dinero2(u.cpaAlto)}, rojo por encima. Pasando el mouse se ve el objetivo de la Calculadora.
          </li>
          <li>
            <b className="text-foreground">Plataforma cuenta N×:</b> compras de Meta + TikTok ÷ pedidos de Shopify. Se
            marca desde {u.factorMinimoPedidos} pedidos: con menos, cualquier compra de más dispara el factor.
          </li>
          <li>
            <b className="text-foreground">Utilidad:</b> la del Control publicitario, con la economía de la Calculadora de
            precios.
          </li>
          {gastoSinProducto > 0 && modo === "riesgo" && (
            <li>
              Hay {dinero(gastoSinProducto)} de campañas sin producto que suman al gasto total pero a ninguna fila (se
              asignan en «Sin nomenclatura»).
            </li>
          )}
        </ul>
      </details>
    </div>
  );
}
