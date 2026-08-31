import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";
import type { CuboSerie, Granularidad, SerieDelPeriodo } from "@/lib/reporte-medidas";

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
// desde acá se arrastraría Prisma al navegador.

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** El día de Ecuador al que pertenece un instante real (una orden). */
function diaEcuador(instante: Date) {
  return isoDia(new Date(instante.getTime() - 5 * 3600_000));
}

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El lunes de la semana de un día, como marca de día UTC. */
function lunesDe(dia: Date) {
  const dow = dia.getUTCDay(); // 0 domingo … 6 sábado
  const atras = dow === 0 ? 6 : dow - 1;
  return new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() - atras));
}

/**
 * Cuántos días agrupa cada barra. Con un año de historia, 366 barras no se
 * leen ni con scroll: pasado cierto largo lo honesto es agrupar y decirlo,
 * no dibujar rayas de un píxel.
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
  const dias: Date[] = [];
  const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const ultimo = Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate());
  while (cursor.getTime() <= ultimo) {
    dias.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

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
    const inicio =
      granularidad === "dia"
        ? dia
        : granularidad === "semana"
          ? lunesDe(dia)
          : new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), 1));
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

function etiquetaDe(inicio: Date, granularidad: Granularidad) {
  const d = inicio.getUTCDate();
  const m = MES_CORTO[inicio.getUTCMonth()];
  if (granularidad === "mes") return `${m} ${String(inicio.getUTCFullYear()).slice(2)}`;
  // Con el día y el mes juntos no hace falta adivinar dónde cambió el mes.
  return `${d} ${m}`;
}

function detalleDe(inicio: Date, fin: Date, granularidad: Granularidad) {
  const largo = (d: Date) => `${d.getUTCDate()} ${MES_CORTO[d.getUTCMonth()]}`;
  if (granularidad === "dia") return largo(inicio);
  if (granularidad === "mes") {
    return `${MES_CORTO[inicio.getUTCMonth()]} ${inicio.getUTCFullYear()}`;
  }
  return `${largo(inicio)} — ${largo(fin)}`;
}

