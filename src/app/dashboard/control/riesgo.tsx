"use client";

import type { Riesgo } from "@/lib/shopify-vs-ads-calculo";
import { CONFIRMACION_ALTA } from "@/lib/shopify-vs-ads-calculo";
import EditorEtiquetas from "./etiquetas";

// Los productos por riesgo.
//
// Es el archivo de Emilia (confirmación y CPA por producto) dentro de Jarvis,
// por secciones como lo pidieron el 10-nov: el top 10 del mes, los de riesgo
// bajo (confirman 70% o más con buen CPA, como las gotas de drenaje), los de
// riesgo medio, los de riesgo alto (confirman poco y el CPA no da), los de
// testeo y los que venden sin pauta. La confirmación y la economía salen de
// la Calculadora, igual que en Resultados: si se actualiza allá, acá cambia.

export type FilaRiesgo = {
  productId: string | null;
  nombre: string;
  codigo: string;
  sku: string | null;
  etiquetas: string[];
  pedidos: number;
  efectividad: number;
  cpaReal: number | null;
  cpaObjetivo: number | null;
  gasto: number;
  utilidad: number;
  riesgo: Riesgo;
};

export type DatosRiesgo = {
  top: FilaRiesgo[];
  bajo: FilaRiesgo[];
  medio: FilaRiesgo[];
  alto: FilaRiesgo[];
  testeo: FilaRiesgo[];
  /** Con pauta y pedidos pero sin confirmación cargada en la Calculadora. */
  faltaCalculadora: FilaRiesgo[];
  apagados: FilaRiesgo[];
  sinPauta: { productId: string | null; nombre: string; sku: string | null; etiquetas: string[]; shopify: number }[];
};

const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dinero2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const entero = (n: number) => Math.round(n).toLocaleString("es-EC");
const pct = (n: number) => `${Math.round(n * 100)}%`;

function Linea({ f, editable }: { f: FilaRiesgo; editable: boolean }) {
  const cpaTono =
    f.cpaReal == null || f.cpaObjetivo == null ? "text-foreground" : f.cpaReal <= f.cpaObjetivo ? "text-good" : "text-critical";
  return (
    <li className="flex flex-col gap-1 border-t border-border px-4 py-2.5 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">{f.nombre}</span>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${f.utilidad >= 0 ? "text-good" : "text-critical"}`}>
          {dinero(f.utilidad)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
        {f.sku && <span>SKU {f.sku}</span>}
        <span>{entero(f.pedidos)} pedidos</span>
        {f.efectividad > 0 ? (
          <span className={f.efectividad >= CONFIRMACION_ALTA ? "text-good" : ""}>confirma {pct(f.efectividad)}</span>
        ) : (
          <span className="text-warning">sin confirmación en la Calculadora</span>
        )}
        <span>
          CPA <b className={cpaTono}>{f.cpaReal == null ? "—" : dinero2(f.cpaReal)}</b>
          {f.cpaObjetivo != null && <> / obj. {dinero2(f.cpaObjetivo)}</>}
        </span>
      </div>
      <EditorEtiquetas productId={f.productId} etiquetas={f.etiquetas} editable={editable} />
    </li>
  );
}

function Seccion({
  titulo,
  nota,
  filas,
  borde,
  editable,
}: {
  titulo: string;
  nota: string;
  filas: FilaRiesgo[];
  borde: string;
  editable: boolean;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-xl border bg-surface ${borde}`}>
      <div className="border-b border-border px-4 py-3">
        <h3 className="flex items-center justify-between text-sm font-semibold text-foreground">
          {titulo} <span className="text-xs font-normal text-muted">{filas.length}</span>
        </h3>
        <p className="mt-0.5 text-xs text-muted">{nota}</p>
      </div>
      {filas.length ? (
        <ul className="flex flex-col">
          {filas.map((f) => (
            <Linea key={f.productId ?? f.nombre} f={f} editable={editable} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-5 text-center text-xs text-muted">Ninguno en este período.</p>
      )}
    </section>
  );
}

export default function RiesgoProductos({ datos, editable }: { datos: DatosRiesgo; editable: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Top 10 del período</h2>
          <p className="mt-0.5 text-xs text-muted">Los que más utilidad dejaron, con su confirmación y su CPA real.</p>
        </div>
        <ol className="grid gap-px bg-border sm:grid-cols-2">
          {datos.top.map((f, i) => (
            <li key={f.productId ?? f.nombre} className="flex items-center gap-3 bg-surface px-4 py-2.5">
              <span className="w-6 text-lg font-semibold tabular-nums text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{f.nombre}</p>
                <p className="text-[11px] text-muted">
                  {entero(f.pedidos)} pedidos · confirma {pct(f.efectividad)} · CPA{" "}
                  {f.cpaReal == null ? "—" : dinero2(f.cpaReal)}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-good">{dinero(f.utilidad)}</span>
            </li>
          ))}
          {datos.top.length === 0 && <li className="bg-surface px-4 py-5 text-center text-xs text-muted">Sin ventas en el período.</li>}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Seccion
          titulo="Riesgo bajo"
          nota={`Confirman ${pct(CONFIRMACION_ALTA)} o más y el CPA real está dentro del objetivo.`}
          filas={datos.bajo}
          borde="border-good/40"
          editable={editable}
        />
        <Seccion
          titulo="Riesgo medio"
          nota="Una de las dos anda bien y la otra no: confirmación o CPA."
          filas={datos.medio}
          borde="border-warning/40"
          editable={editable}
        />
        <Seccion
          titulo="Riesgo alto"
          nota="Confirman poco y el CPA no da, o pierden plata."
          filas={datos.alto}
          borde="border-critical/40"
          editable={editable}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion
          titulo="En testeo"
          nota="Los marcados con la etiqueta Testeo. No entran en las secciones de riesgo."
          filas={datos.testeo}
          borde="border-border"
          editable={editable}
        />
        <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-4 py-3">
            <h3 className="flex items-center justify-between text-sm font-semibold text-foreground">
              Venden sin pauta <span className="text-xs font-normal text-muted">{datos.sinPauta.length}</span>
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              Tienen pedidos en Shopify y ningún gasto publicitario en el período: recompras y ventas orgánicas. También
              los marcados como Orgánico.
            </p>
          </div>
          <ul className="flex flex-col">
            {datos.sinPauta.map((f) => (
              <li key={f.productId ?? f.nombre} className="flex flex-col gap-1 border-t border-border px-4 py-2.5 first:border-t-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium text-foreground">{f.nombre}</span>
                  <span className="text-sm tabular-nums text-muted">{entero(f.shopify)} pedidos</span>
                </div>
                {f.sku && <span className="text-[11px] text-muted">SKU {f.sku}</span>}
                <EditorEtiquetas productId={f.productId} etiquetas={f.etiquetas} editable={editable} />
              </li>
            ))}
            {datos.sinPauta.length === 0 && <li className="px-4 py-5 text-center text-xs text-muted">Ninguno.</li>}
          </ul>
        </section>
      </div>

      {datos.faltaCalculadora.length > 0 && (
        <Seccion
          titulo="Falta cargar en la Calculadora"
          nota="Tienen pauta y pedidos, pero no tienen la confirmación cargada: sin eso no se puede saber su riesgo ni su utilidad. Se cargan en Calculadora de precios."
          filas={datos.faltaCalculadora}
          borde="border-warning/40"
          editable={editable}
        />
      )}

      {datos.apagados.length > 0 && (
        <Seccion
          titulo="Apagados"
          nota="Marcados como Apagado. Se muestran aparte para que no ensucien las secciones de riesgo."
          filas={datos.apagados}
          borde="border-border"
          editable={editable}
        />
      )}
    </div>
  );
}
