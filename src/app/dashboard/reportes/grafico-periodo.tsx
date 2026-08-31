"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
// De reporte-medidas y no de reporte-serie: lo segundo importa Prisma, y esto
// corre en el navegador.
import {
  LIMITE_PESO_PAUTA,
  NOMBRE_GRANULARIDAD,
  type SerieDelPeriodo,
} from "@/lib/reporte-medidas";

// El gráfico de la pantalla de Reportes.
//
// Lo que había antes eran barras de facturado con la línea del gasto encima,
// las dos en la MISMA escala. Con ~$20.000 de facturación y ~$1.500 de pauta,
// la línea del gasto quedaba pegada al eje: se veía que existía y nada más.
// Y no había eje Y ni un solo número, así que ninguna barra decía cuánto.
//
// La salida NO es un segundo eje Y. Dos escalas en un mismo plano se alinean
// de forma arbitraria y hacen ver una correlación que los datos no tienen —
// es el error clásico de este gráfico exacto.
//
// Se parte en dos gráficos apilados que comparten el eje X:
//
//   arriba   facturado en dólares, con eje Y y valores legibles;
//   abajo    el gasto como PORCENTAJE de lo facturado.
//
// El de abajo no es el mismo dato en otra escala: es la métrica que de verdad
// se decide. "Gasté $1.500" solo no dice nada; "se fue el 34% de lo que
// facturé" se compara contra el límite y contra cualquier otro día, aunque el
// volumen de ese día no tenga nada que ver.

const ANCHO_POR_CUBO = 44;

const FACTURADO = "var(--chart-1)";
const PAUTA = "var(--chart-3)";

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Para el eje y las etiquetas sobre las barras, donde no entra "$21.480". */
function moneyCorta(n: number) {
  if (Math.abs(n) >= 1000) {
    const miles = n / 1000;
    // El decimal solo cuando aporta: "$5,0 K" al lado de "$10 K" se lee como
    // si midieran distinto. Y va con COMA, como el resto de la app: con punto,
    // "$21.5 K" se lee en es-EC como veintiún mil quinientos.
    const entero = Number.isInteger(miles) || Math.abs(miles) >= 100;
    return `$${miles.toFixed(entero ? 0 : 1).replace(".", ",")} K`;
  }
  return `$${Math.round(n)}`;
}

// Con coma decimal, como el resto de la app.
const pct = (n: number) => `${n.toFixed(n >= 10 ? 0 : 1).replace(".", ",")}%`;

type Fila = SerieDelPeriodo["cubos"][number] & {
  etiquetaFacturado: string;
  etiquetaPeso: string;
};

function TooltipCubo({ active, payload }: { active?: boolean; payload?: { payload: Fila }[] }) {
  const c = payload?.[0]?.payload;
  if (!active || !c) return null;
  return (
    <div className="rounded border border-border bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="mb-1 font-medium">{c.detalle}</p>
      {/* El valor manda y el nombre acompaña: acá el lector ya sabe qué serie
          miró, lo que le falta es el número. */}
      <p className="tabular-nums">
        {money(c.facturado)} <span className="text-muted">facturado · {c.ordenes} órdenes</span>
      </p>
      <p className="tabular-nums">
        {money(c.gasto)} <span className="text-muted">en pauta</span>
      </p>
      <p className="tabular-nums">
        {c.pesoPauta == null ? (
          <span className="text-muted">Sin ventas: el porcentaje no existe</span>
        ) : (
          <>
            {pct(c.pesoPauta)} <span className="text-muted">de lo facturado</span>
          </>
        )}
      </p>
    </div>
  );
}

export default function GraficoPeriodo({
  serie,
  periodo,
}: {
  serie: SerieDelPeriodo;
  /** Qué período cubre. Sin esto el gráfico no dice de cuándo habla. */
  periodo: string;
}) {
  const { cubos, granularidad, totales, hayTienda } = serie;

  if (!hayTienda) {
    return (
      <Tarjeta periodo={periodo} granularidad={NOMBRE_GRANULARIDAD[granularidad]}>
        <p className="py-8 text-center text-sm text-muted">
          No hay una tienda de Shopify conectada, así que no hay facturación contra la cual medir
          la pauta.{" "}
          <a href="/dashboard/conexiones" className="text-accent hover:underline">
            Ir a Conexiones
          </a>
        </p>
      </Tarjeta>
    );
  }

  if (cubos.length === 0 || (totales.facturado === 0 && totales.gasto === 0)) {
    return (
      <Tarjeta periodo={periodo} granularidad={NOMBRE_GRANULARIDAD[granularidad]}>
        <p className="py-8 text-center text-sm text-muted">
          No hay ventas ni gasto en pauta registrados en {periodo.toLowerCase()}.
        </p>
      </Tarjeta>
    );
  }

  const maxFacturado = Math.max(...cubos.map((c) => c.facturado));
  const maxPeso = Math.max(0, ...cubos.map((c) => c.pesoPauta ?? 0));

  // Cuáles llevan el número escrito encima. Un valor sobre CADA barra es ruido
  // y termina sin leerse ninguno; el eje Y, el tooltip y la tabla cubren el
  // resto.
  const aEtiquetar = new Set<number>();
  const pesoAEtiquetar = new Set<number>();
  if (cubos.length <= 8) {
    cubos.forEach((_, i) => {
      aEtiquetar.add(i);
      pesoAEtiquetar.add(i);
    });
  } else {
    aEtiquetar.add(cubos.findIndex((c) => c.facturado === maxFacturado));
    aEtiquetar.add(cubos.length - 1);
    pesoAEtiquetar.add(cubos.findIndex((c) => (c.pesoPauta ?? -1) === maxPeso));
    pesoAEtiquetar.add(cubos.length - 1);
  }

  const datos: Fila[] = cubos.map((c, i) => ({
    ...c,
    etiquetaFacturado: aEtiquetar.has(i) && c.facturado > 0 ? moneyCorta(c.facturado) : "",
    etiquetaPeso: pesoAEtiquetar.has(i) && c.pesoPauta != null ? pct(c.pesoPauta) : "",
  }));

  // El techo del eje del porcentaje deja siempre visible el límite: ajustado
  // solo al máximo, un período bueno escondería la referencia contra la que
  // hay que leerlo.
  //
  // Las marcas se calculan a mano en pasos redondos. Con el reparto automático
  // un techo de 50 salía "0 / 12,5% / 25% / 37,5% / 50%", y un eje con decimal
  // y medio obliga a leerlo dos veces.
  const techoBruto = Math.max(LIMITE_PESO_PAUTA + 15, maxPeso * 1.15);
  const paso = [5, 10, 20, 25, 50, 100].find((p) => techoBruto / p <= 5) ?? 200;
  const techoPeso = Math.ceil(techoBruto / paso) * paso;
  const marcasPeso = Array.from({ length: techoPeso / paso + 1 }, (_, i) => i * paso);

  const anchoMinimo = cubos.length * ANCHO_POR_CUBO;
  // Los puntos ayudan mientras se distingan; con dos meses de días encima se
  // convierten en una fila de manchas.
  const conPuntos = cubos.length <= 31;

  const ejeY = {
    width: 62,
    tick: { fontSize: 10, fill: "var(--muted)" },
    axisLine: false,
    tickLine: false,
  } as const;
  const margenes = { top: 18, right: 12, left: 0, bottom: 0 };

  const sinDatos = cubos.filter((c) => c.pesoPauta == null).length;

  return (
    <Tarjeta periodo={periodo} granularidad={NOMBRE_GRANULARIDAD[granularidad]}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="tabular-nums">
          <span className="font-semibold">{money(totales.facturado)}</span>{" "}
          <span className="text-muted">facturado</span>
        </span>
        <span className="tabular-nums">
          <span className="font-semibold">{money(totales.gasto)}</span>{" "}
          <span className="text-muted">en pauta</span>
        </span>
        <span className="tabular-nums">
          <span
            className={`font-semibold ${
              totales.pesoPauta != null && totales.pesoPauta > LIMITE_PESO_PAUTA
                ? "text-critical"
                : ""
            }`}
          >
            {totales.pesoPauta == null ? "—" : pct(totales.pesoPauta)}
          </span>{" "}
          <span className="text-muted">del facturado se fue en pauta</span>
        </span>
      </div>

      {/* Un solo contenedor con scroll para los dos gráficos: separados, se
          podrían desplazar distinto y las columnas dejarían de coincidir. El
          scroll vive acá adentro, así el cuerpo de la página nunca scrollea en
          horizontal. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div style={{ minWidth: anchoMinimo }}>
          <p className="mb-1 text-xs font-medium">Facturado</p>
          <div style={{ width: "100%", height: 190 }}>
            <ResponsiveContainer>
              <BarChart data={datos} margin={margenes} barCategoryGap="18%">
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="etiqueta" hide />
                <YAxis {...ejeY} tickFormatter={moneyCorta} />
                <Tooltip
                  content={<TooltipCubo />}
                  cursor={{ fill: "var(--surface-2)" }}
                  wrapperStyle={{ outline: "none" }}
                />
                <Bar dataKey="facturado" fill={FACTURADO} radius={[4, 4, 0, 0]} maxBarSize={24}>
                  {/* El texto no se pinta del color de la serie: el verde de la
                      barra sobre el fondo de la tarjeta no se lee como texto. */}
                  <LabelList
                    dataKey="etiquetaFacturado"
                    position="top"
                    fill="var(--muted)"
                    fontSize={10}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mb-1 mt-3 text-xs font-medium">
            Gasto en pauta <span className="text-muted">· % de lo facturado</span>
          </p>
          <div style={{ width: "100%", height: 150 }}>
            <ResponsiveContainer>
              <ComposedChart data={datos} margin={margenes}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="etiqueta"
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  interval={0}
                  height={22}
                />
                <YAxis
                  {...ejeY}
                  domain={[0, techoPeso]}
                  ticks={marcasPeso}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  content={<TooltipCubo />}
                  cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
                  wrapperStyle={{ outline: "none" }}
                />
                {/* Punteada a propósito: es un umbral, no una línea de la
                    cuadrícula. */}
                <ReferenceLine
                  y={LIMITE_PESO_PAUTA}
                  stroke="var(--critical)"
                  strokeDasharray="4 3"
                  label={{
                    value: `límite ${LIMITE_PESO_PAUTA}%`,
                    position: "insideTopRight",
                    fill: "var(--muted)",
                    fontSize: 10,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="pesoPauta"
                  stroke={PAUTA}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  connectNulls={false}
                  dot={
                    conPuntos
                      ? { r: 4, fill: PAUTA, stroke: "var(--surface)", strokeWidth: 2 }
                      : false
                  }
                  activeDot={{ r: 5, fill: PAUTA, stroke: "var(--surface)", strokeWidth: 2 }}
                >
                  <LabelList
                    dataKey="etiquetaPeso"
                    position="top"
                    fill="var(--muted)"
                    fontSize={10}
                  />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {sinDatos > 0 && (
        <p className="mt-2 text-xs text-muted">
          {sinDatos === 1 ? "Un período queda" : `${sinDatos} períodos quedan`} sin punto de
          porcentaje: no hubo facturación, así que el porcentaje no existe. Un cero ahí diría que
          la pauta no costó nada.
        </p>
      )}

      {/* La tabla con todos los valores. El gráfico muestra la forma; acá está
          el número exacto de cada uno, sin depender de pasar el mouse. */}
      <details className="mt-3 border-t border-border pt-2">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
          Ver los valores en tabla ({cubos.length})
        </summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="table-cols w-full text-xs">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className="px-2 py-1.5 text-left">Período</th>
                <th className="px-2 py-1.5 text-right">Facturado</th>
                <th className="px-2 py-1.5 text-right">Órdenes</th>
                <th className="px-2 py-1.5 text-right">Pauta</th>
                <th className="px-2 py-1.5 text-right">% del facturado</th>
              </tr>
            </thead>
            <tbody>
              {cubos.map((c) => (
                <tr key={c.clave} className="border-t border-border">
                  <td className="whitespace-nowrap px-2 py-1.5">{c.detalle}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(c.facturado)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{c.ordenes}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{money(c.gasto)}</td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      c.pesoPauta != null && c.pesoPauta > LIMITE_PESO_PAUTA ? "text-critical" : ""
                    }`}
                  >
                    {c.pesoPauta == null ? "—" : pct(c.pesoPauta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Tarjeta>
  );
}

function Tarjeta({
  periodo,
  granularidad,
  children,
}: {
  periodo: string;
  granularidad: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
        {periodo} · facturado y peso de la pauta{" "}
        <span className="normal-case">({granularidad})</span>
      </p>
      {children}
    </div>
  );
}
