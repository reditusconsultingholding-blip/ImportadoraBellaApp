"use client";

import { useState } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { NOMBRE_GRANULARIDAD, type Granularidad } from "@/lib/reporte-medidas";
import { cuboBajoElCursor } from "@/lib/serie-cubos";
import type { CuboVentas, SerieVentas } from "@/lib/ventas-medidas";

// Las ventas del período repartidas en el tiempo, con la granularidad a mano.
//
// El dueño lo pidió así: "por hora y por días… si pongo últimos 7 días, que
// aparezcan las ventas por día, y también un apartado por hora; y en 30 días y
// 3 meses, no los días tanto, sino los meses". El período elige solo la
// granularidad más gruesa que todavía deja barras legibles, y los botones
// dejan cambiarla sin volver a cargar la pantalla: las tres vistas vienen
// armadas del servidor con la MISMA consulta de órdenes.
//
// Es un solo dato por barra, no dos escalas en un mismo plano. La otra opción
// —facturado y órdenes juntos con dos ejes Y— alinea las escalas de forma
// arbitraria y hace ver una relación entre ticket y volumen que el gráfico no
// midió. Las órdenes están en la lectura de arriba y en la tabla, que es donde
// se comparan de verdad.

const ANCHO_POR_CUBO = 44;

const VENTAS = "var(--chart-1)";

/** Lo que se le baja a una barra incompleta para que no se lea como completa. */
const OPACIDAD_PARCIAL = 0.4;

const money = (n: number) =>
  n.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const entero = (n: number) => n.toLocaleString("es-EC");

/**
 * Para el eje y las etiquetas sobre las barras, donde no entra "$21.480".
 *
 * La "K" va PEGADA al número. Recharts parte el texto de una etiqueta en los
 * espacios y lo apila en dos renglones: "$38,0 K" quedaba como "$38,0" arriba
 * de "K", el doble de alto, y a la barra más alta se le cortaba el número
 * contra el borde de arriba del gráfico.
 */
function moneyCorta(n: number) {
  if (Math.abs(n) >= 1000) {
    const miles = n / 1000;
    // El decimal solo cuando aporta: "$38,0K" al lado de "$12,5K" hace dudar
    // de si mide distinto. Se mira el decimal YA REDONDEADO, porque 38.043 no
    // es entero pero se escribe igual. Y con COMA: con punto, "$21.5K" se lee
    // en es-EC como veintiún mil quinientos.
    const redondo = Math.abs(miles) >= 100 || Math.round(miles * 10) % 10 === 0;
    return `$${miles.toFixed(redondo ? 0 : 1).replace(".", ",")}K`;
  }
  return `$${Math.round(n)}`;
}

type Fila = CuboVentas & {
  /** `null` cuando no hay dato: recharts no dibuja la barra, que es el punto. */
  valor: number | null;
  etiquetaValor: string;
};

export default function VentasEnElTiempo({
  serie,
  periodo,
  verCifras,
}: {
  serie: SerieVentas;
  /** Qué período cubre. Sin esto el gráfico no dice de cuándo habla. */
  periodo: string;
  verCifras: boolean;
}) {
  // Arranca en la que el período eligió. Es un inicializador y no un efecto:
  // el lint prohíbe setState dentro de useEffect, y con razón — eso pintaría
  // una vez con la granularidad equivocada antes de corregirse.
  const [elegida, setElegida] = useState<Granularidad>(serie.porDefecto);
  const [encima, setEncima] = useState<Fila | null>(null);

  // Cambiar de período no reinicia el estado del componente, así que la
  // granularidad elegida puede quedar sin vista: de "hoy" por hora a "12
  // meses" no hay 8.784 barras. Se cae a la del período nuevo en vez de
  // quedarse en blanco, y el botón marcado es el que de verdad se está viendo.
  const vista =
    serie.vistas.find((v) => v.granularidad === elegida) ??
    serie.vistas.find((v) => v.granularidad === serie.porDefecto) ??
    serie.vistas[0];

  if (!serie.hayTienda) {
    return (
      <Tarjeta periodo={periodo} granularidad={null}>
        <p className="py-8 text-center text-sm text-muted">
          No hay una tienda de Shopify conectada, así que no hay ventas que
          mostrar en el tiempo.{" "}
          <a href="/dashboard/conexiones" className="text-accent hover:underline">
            Ir a Conexiones
          </a>
        </p>
      </Tarjeta>
    );
  }

  if (!vista || serie.totales.ordenes === 0) {
    return (
      <Tarjeta periodo={periodo} granularidad={null}>
        <p className="py-8 text-center text-sm text-muted">
          No entró ninguna orden en {periodo.toLowerCase()}.
          {serie.ventasDesde && ` Las órdenes guardadas empiezan el ${serie.ventasDesde}.`}
        </p>
      </Tarjeta>
    );
  }

  const { cubos, granularidad } = vista;

  // Qué mide la barra. Sin permiso de finanzas el facturado ni siquiera llegó
  // al navegador (ver ventas-serie.ts), así que la serie es la CANTIDAD de
  // órdenes: cuándo se vende, que es información de rendimiento, sin decir
  // cuánto entra.
  const valorDe = (c: CuboVentas) => (verCifras ? (c.facturado ?? 0) : c.ordenes);
  const cortito = verCifras ? moneyCorta : entero;
  const exacto = verCifras ? money : entero;
  const queMide = verCifras ? "Facturado" : "Órdenes";

  const maximo = Math.max(...cubos.map(valorDe));

  // Cuáles llevan el número escrito encima. Un valor sobre CADA barra es ruido
  // y termina sin leerse ninguno; el eje, la lectura de arriba y la tabla
  // cubren el resto.
  const aEtiquetar = new Set<number>();
  if (cubos.length <= 8) {
    cubos.forEach((_, i) => aEtiquetar.add(i));
  } else {
    aEtiquetar.add(cubos.findIndex((c) => valorDe(c) === maximo));
    aEtiquetar.add(cubos.findLastIndex((c) => !c.sinDatos));
  }

  const datos: Fila[] = cubos.map((c, i) => ({
    ...c,
    valor: c.sinDatos ? null : valorDe(c),
    etiquetaValor:
      aEtiquetar.has(i) && !c.sinDatos && valorDe(c) > 0 ? cortito(valorDe(c)) : "",
  }));

  // Los cubos sin dato son siempre los del arranque o los del final —la
  // ventana de la que se sabe algo es un tramo continuo—, y cada punta se
  // explica por un motivo distinto.
  const primero = cubos.findIndex((c) => !c.sinDatos);
  const sinHistorial = primero < 0 ? 0 : primero;
  const sinTranscurrir =
    primero < 0 ? 0 : cubos.length - 1 - cubos.findLastIndex((c) => !c.sinDatos);

  const anchoMinimo = cubos.length * ANCHO_POR_CUBO;

  return (
    <Tarjeta periodo={periodo} granularidad={NOMBRE_GRANULARIDAD[granularidad]}>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {serie.opciones.map((o) => {
          const on = o.id === granularidad;
          return (
            <button
              key={o.id}
              onClick={() => setElegida(o.id)}
              disabled={o.impedimento !== null}
              // El motivo va en el botón apagado y no escondido en una nota al
              // pie: apretar algo que no responde y no saber por qué se lee
              // como que la pantalla está rota.
              title={o.impedimento ?? `${o.barras} barras`}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? "border-accent bg-good-bg text-accent-strong"
                  : o.impedimento
                    ? "cursor-not-allowed border-border text-muted opacity-40"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          );
        })}
        <span className="ml-1 text-xs tabular-nums text-muted">
          {verCifras && serie.totales.facturado !== undefined && (
            <>
              <span className="font-semibold text-foreground">
                {money(serie.totales.facturado)}
              </span>{" "}
              en{" "}
            </>
          )}
          <span className={verCifras ? "" : "font-semibold text-foreground"}>
            {entero(serie.totales.ordenes)}
          </span>{" "}
          órdenes
        </span>
      </div>

      {/* La lectura va FUERA del área con scroll y siempre en el mismo lugar,
          no como globo flotante: el globo lo dibuja el gráfico adentro del
          contenedor con `overflow`, y cerca del borde derecho queda cortado a
          la mitad. Fijo también se compara mejor, porque los números no saltan
          con el cursor. */}
      <div className="mb-2 min-h-[2.25rem] rounded border border-border bg-surface-2 px-3 py-1.5">
        <Lectura c={encima} granularidad={granularidad} verCifras={verCifras} />
      </div>

      {/* El scroll vive acá adentro, así el cuerpo de la página nunca scrollea
          en horizontal. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div style={{ minWidth: anchoMinimo }}>
          <div style={{ width: "100%", height: 230 }}>
            <ResponsiveContainer>
              <BarChart
                data={datos}
                // Arriba entra el número de la barra más alta: sin ese margen
                // la etiqueta se corta contra el borde del gráfico.
                margin={{ top: 22, right: 12, left: 0, bottom: 0 }}
                barCategoryGap="18%"
                // Recharts entrega el ÍNDICE del cubo activo, no su contenido.
                onMouseMove={(e) => setEncima(cuboBajoElCursor(e.activeTooltipIndex, datos))}
                onMouseLeave={() => setEncima(null)}
              >
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
                  width={62}
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={cortito}
                />
                <Tooltip
                  content={() => null}
                  cursor={{ fill: "var(--surface-2)" }}
                  wrapperStyle={{ outline: "none" }}
                />
                {/* Sin animación de entrada. Cambiar de granularidad tiene que
                    sentirse instantáneo, y el gráfico de Reportes muestra por
                    qué conviene: ahí las barras arrancan achatadas y recién
                    saltan a su altura real cuando el mouse toca el gráfico, así
                    que lo primero que se ve son alturas que no son las de los
                    datos. */}
                <Bar
                  dataKey="valor"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                >
                  {datos.map((c) => (
                    <Cell
                      key={c.clave}
                      fill={VENTAS}
                      fillOpacity={c.parcial ? OPACIDAD_PARCIAL : 1}
                    />
                  ))}
                  {/* El texto no se pinta del color de la serie: el verde de la
                      barra sobre el fondo de la tarjeta no se lee como texto. */}
                  <LabelList
                    dataKey="etiquetaValor"
                    position="top"
                    fill="var(--muted)"
                    fontSize={10}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-1 text-xs text-muted">
        {vista.parciales > 0 && (
          <p>
            <span
              className="mr-1.5 inline-block h-2 w-2 rounded-[1px] align-middle"
              style={{ background: VENTAS, opacity: OPACIDAD_PARCIAL }}
            />
            {vista.parciales === 1 ? "Una barra más clara" : `${vista.parciales} barras más claras`}
            : el tramo todavía está transcurriendo o el período lo corta por la
            mitad. Es un dato real, pero comparar su altura contra una barra
            completa hace ver una caída que no hubo.
          </p>
        )}
        {sinTranscurrir > 0 && (
          <p>
            {sinTranscurrir === 1 ? "Falta una barra" : `Faltan ${sinTranscurrir} barras`} al
            final: ese tramo todavía no llegó. No se dibuja en cero porque un
            cero diría que no se vendió nada.
          </p>
        )}
        {sinHistorial > 0 && (
          <p>
            {sinHistorial === 1 ? "Falta una barra" : `Faltan ${sinHistorial} barras`} al
            principio: el período empieza antes que las órdenes sincronizadas
            {serie.ventasDesde ? `, que arrancan el ${serie.ventasDesde}` : ""}. Ahí no hay
            dato, no hay ventas en cero.
          </p>
        )}
      </div>

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
                {verCifras && <th className="px-2 py-1.5 text-right">Facturado</th>}
                <th className="px-2 py-1.5 text-right">Órdenes</th>
                <th className="px-2 py-1.5 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {cubos.map((c) => (
                <tr key={c.clave} className="border-t border-border">
                  <td className="whitespace-nowrap px-2 py-1.5">{c.detalle}</td>
                  {verCifras && (
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {c.sinDatos ? "—" : money(c.facturado ?? 0)}
                    </td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {c.sinDatos ? "—" : entero(c.ordenes)}
                  </td>
                  <td className="px-2 py-1.5 text-muted">
                    {c.sinDatos ? "sin dato" : c.parcial ? "incompleto" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="sr-only">
        {queMide} {NOMBRE_GRANULARIDAD[granularidad]} en {periodo.toLowerCase()},{" "}
        {cubos.length} barras. Máximo {exacto(maximo)}.
      </p>
    </Tarjeta>
  );
}

/** La lectura del cubo sobre el que está el cursor. */
function Lectura({
  c,
  granularidad,
  verCifras,
}: {
  c: Fila | null;
  granularidad: Granularidad;
  verCifras: boolean;
}) {
  if (!c) {
    return (
      <p className="text-xs text-muted">
        Pasa el cursor por una barra para ver el detalle{" "}
        {NOMBRE_GRANULARIDAD[granularidad]}.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-xs tabular-nums">
      <span className="font-medium">{c.detalle}</span>
      {c.sinDatos ? (
        <span className="text-muted">sin dato sincronizado para ese tramo</span>
      ) : (
        <>
          {verCifras && (
            <span>
              {money(c.facturado ?? 0)} <span className="text-muted">facturado</span>
            </span>
          )}
          <span>
            {entero(c.ordenes)} <span className="text-muted">órdenes</span>
          </span>
          {c.parcial && <span className="text-warning">tramo incompleto</span>}
        </>
      )}
    </p>
  );
}

function Tarjeta({
  periodo,
  granularidad,
  children,
}: {
  periodo: string;
  granularidad: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
        {periodo} · ventas en el tiempo
        {granularidad && <span className="normal-case"> ({granularidad})</span>}
      </p>
      {/* Vale la pena decirlo acá: el resto del Panel habla de compras
          ATRIBUIDAS por Meta y TikTok, que siempre son más. Este bloque es lo
          que de verdad entró por la tienda. */}
      <p className="mb-3 mt-0.5 text-xs text-muted">
        Órdenes reales de Shopify, no compras atribuidas por Meta o TikTok. En hora
        de Ecuador: una venta de las 21:00 cuenta a las 21:00, no a las 02:00 del
        día siguiente como la vería el servidor.
      </p>
      {children}
    </div>
  );
}
