import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";
import type { CuboSerie, Granularidad, SerieDelPeriodo } from "@/lib/reporte-medidas";
import {
  cubosDelPeriodo,
  detalleDe,
  diaEcuador,
  etiquetaDe,
  inicioDeCubo,
  isoDia,
} from "@/lib/serie-cubos";

// La serie del período para la pantalla de Reportes: cuánto se facturó y
// cuánto pesó la pauta, día por día.
//
// Antes esto vivía adentro de la pantalla y disparaba dos consultas POR DÍA
// (28 para catorce días). Con un selector de período eso se iba a 730 para un
// año, así que acá se hace al revés: dos consultas para todo el rango y el
// reparto en cubos se arma en memoria.
//
// El otro cambio importante es el segundo número. Antes el gráfico ponía el
// facturado (~$20.000 al día) y el gasto (~$1.500) en la MISMA escala, así que
// la línea del gasto quedaba aplastada contra el eje y no decía nada. Lo que
// de verdad se decide no es el gasto en dólares sino cuánto de lo facturado se
// va en pauta, y eso vive naturalmente entre 0 y 100.

// Las formas y el umbral viven en reporte-medidas.ts: el gráfico es cliente y
// desde acá se arrastraría Prisma al navegador. El calendario —en qué barra
// cae cada instante y cómo se llama— vive en serie-cubos.ts, compartido con la
// serie de ventas del Panel: era el mismo código escrito dos veces.

/**
 * Cuántos días agrupa cada barra. Con un año de historia, 366 barras no se
 * leen ni con scroll: pasado cierto largo lo honesto es agrupar y decirlo,
 * no dibujar rayas de un píxel.
 *
 * No usa el criterio del Panel aunque los cortes coincidan: allá se puede
 * abrir por hora y acá no. El gasto de Meta y TikTok llega por día, así que
 * una barra por hora tendría facturación real contra una pauta repartida a
 * ojo.
 */
function granularidadPara(dias: number): Granularidad {
  if (dias <= 62) return "dia";
  if (dias <= 200) return "semana";
  return "mes";
}

export async function serieDelPeriodo(
  organizationId: string,
  range: Range
): Promise<SerieDelPeriodo> {
  // Los días del período, como marcas de día UTC — el mismo formato con el que
  // se guardan los MetricSnapshot.
  const dias = cubosDelPeriodo(range, "dia");

  const granularidad = granularidadPara(dias.length);

  const [tiendas, ordenes, pauta] = await Promise.all([
    db.shopifyStore.count({ where: { organizationId, connectedAt: { not: null } } }),
    // Solo dos columnas: para armar la serie no hace falta traer la orden
    // entera con sus líneas.
    db.shopifyOrder.findMany({
      where: {
        store: { organizationId },
        occurredAt: { gte: range.fromInstant, lte: range.toInstant },
      },
      select: { occurredAt: true, netSales: true },
    }),
    // Una fila por campaña y día; se suman los días de un tirón.
    db.metricSnapshot.groupBy({
      by: ["capturedAt"],
      where: {
        campaign: { adAccount: { organizationId } },
        capturedAt: { gte: range.from, lte: range.to },
      },
      _sum: { spend: true },
    }),
  ]);

  const porDia = new Map<string, { facturado: number; ordenes: number; gasto: number }>();
  const vacio = () => ({ facturado: 0, ordenes: 0, gasto: 0 });
  for (const d of dias) porDia.set(isoDia(d), vacio());

  for (const o of ordenes) {
    // Una orden de las 23:30 del 27 en Ecuador llega como 04:30 UTC del 28: sin
    // el corrimiento caería en el día equivocado.
    const fila = porDia.get(diaEcuador(o.occurredAt));
    if (!fila) continue;
    fila.facturado += o.netSales;
    fila.ordenes += 1;
  }

  for (const p of pauta) {
    const fila = porDia.get(isoDia(p.capturedAt));
    if (!fila) continue;
    fila.gasto += p._sum.spend ?? 0;
  }

  // El reparto en cubos. La clave decide a qué barra va cada día; el orden lo
  // da el recorrido, que ya viene cronológico.
  const cubos: CuboSerie[] = [];
  const indice = new Map<string, number>();

  for (const dia of dias) {
    const inicio = inicioDeCubo(dia, granularidad);
    const clave = isoDia(inicio);

    let pos = indice.get(clave);
    if (pos === undefined) {
      pos = cubos.length;
      indice.set(clave, pos);
      cubos.push({
        clave,
        etiqueta: etiquetaDe(inicio, granularidad),
        detalle: "",
        facturado: 0,
        ordenes: 0,
        gasto: 0,
        pesoPauta: null,
      });
    }

    const fila = porDia.get(isoDia(dia))!;
    cubos[pos].facturado += fila.facturado;
    cubos[pos].ordenes += fila.ordenes;
    cubos[pos].gasto += fila.gasto;
    // El detalle se arma con el ÚLTIMO día visto del cubo, que puede no ser el
    // domingo: una semana cortada por el borde del período tiene que decir
    // hasta dónde llega de verdad.
    cubos[pos].detalle = detalleDe(inicio, dia, granularidad);
  }

  for (const c of cubos) {
    c.pesoPauta = c.facturado > 0 ? (c.gasto / c.facturado) * 100 : null;
  }

  const facturado = cubos.reduce((s, c) => s + c.facturado, 0);
  const gasto = cubos.reduce((s, c) => s + c.gasto, 0);

  return {
    granularidad,
    cubos,
    totales: {
      facturado,
      ordenes: cubos.reduce((s, c) => s + c.ordenes, 0),
      gasto,
      pesoPauta: facturado > 0 ? (gasto / facturado) * 100 : null,
    },
    hayTienda: tiendas > 0,
  };
}
