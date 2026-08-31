import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";
import type { Granularidad } from "@/lib/reporte-medidas";
import {
  coberturaDelCubo,
  cubosDelPeriodo,
  detalleDe,
  etiquetaDe,
  finDeCubo,
  granularidadPorDefecto,
  inicioDeCubo,
  instanteDe,
  isoDia,
  marcaDe,
  opcionesDeGranularidad,
} from "@/lib/serie-cubos";
import type { CuboVentas, SerieVentas, VistaVentas } from "@/lib/ventas-medidas";

// Las ventas del período repartidas en el tiempo, para el Panel.
//
// Son órdenes REALES de Shopify —lo que de verdad entró—, no las compras que
// se atribuyen Meta y TikTok, que siempre son bastante más. Es la diferencia
// más importante entre este bloque y el resto de la pantalla, y por eso está
// escrita también arriba del gráfico.
//
// Tres consultas fijas, no dos por barra: con doce meses por día eso serían
// más de setecientas. Se traen las órdenes del rango de un tirón y el reparto
// en cubos —y en las tres granularidades a la vez— se resuelve en memoria.

/** Cuánto tiene que faltarle a un cubo para llamarlo incompleto. */
const COMPLETO = 0.999;

export async function ventasEnElTiempo(
  organizationId: string,
  range: Range,
  verCifras: boolean,
  ahora: Date = new Date()
): Promise<SerieVentas> {
  const opciones = opcionesDeGranularidad(range);
  const porDefecto = granularidadPorDefecto(range, opciones);

  const [tiendas, ordenes, masVieja] = await Promise.all([
    db.shopifyStore.count({ where: { organizationId, connectedAt: { not: null } } }),
    // Dos columnas nada más: para contar órdenes y sumar facturación no hace
    // falta traer las líneas de cada una.
    db.shopifyOrder.findMany({
      where: {
        store: { organizationId },
        occurredAt: { gte: range.fromInstant, lte: range.toInstant },
      },
      select: { occurredAt: true, netSales: true },
    }),
    db.shopifyOrder.findFirst({
      where: { store: { organizationId } },
      orderBy: { occurredAt: "asc" },
      select: { occurredAt: true },
    }),
  ]);

  // La marca de cada orden se calcula una sola vez y se reusa en las tres
  // granularidades: la hora de Ecuador de una venta no cambia según cómo se
  // la agrupe.
  const marcadas = ordenes.map((o) => ({ marca: marcaDe(o.occurredAt), neto: o.netSales }));

  // De qué tramo del período se sabe algo de verdad.
  //
  // Arriba corta AHORA, no el final del rango: en "hoy" las horas que todavía
  // no llegaron no vendieron cero, simplemente no pasaron. Abajo corta el día
  // de la orden más vieja guardada — se toma el día entero y no el instante
  // exacto porque si ese día hay órdenes, el día está sincronizado, y usar la
  // hora exacta marcaría la primera barra como incompleta sin motivo.
  const primerDia = masVieja
    ? instanteDe(inicioDeCubo(marcaDe(masVieja.occurredAt), "dia"))
    : null;
  const ventana = {
    desde: new Date(Math.max(range.fromInstant.getTime(), primerDia?.getTime() ?? -Infinity)),
    hasta: new Date(Math.min(range.toInstant.getTime() + 1, ahora.getTime())),
  };

  const vistas = opciones
    .filter((o) => !o.impedimento)
    .map((o) => armarVista(o.id, range, marcadas, ventana, verCifras));

  const facturado = marcadas.reduce((s, o) => s + o.neto, 0);

  return {
    hayTienda: tiendas > 0,
    opciones,
    porDefecto,
    vistas,
    // El facturado se arma aparte y no se copia si no corresponde: sin permiso
    // la clave no existe en la respuesta.
    totales: verCifras ? { ordenes: ordenes.length, facturado } : { ordenes: ordenes.length },
    ventasDesde: masVieja ? isoDia(marcaDe(masVieja.occurredAt)) : null,
  };
}

function armarVista(
  granularidad: Granularidad,
  range: Range,
  ordenes: { marca: Date; neto: number }[],
  ventana: { desde: Date; hasta: Date },
  verCifras: boolean
): VistaVentas {
  const inicios = cubosDelPeriodo(range, granularidad);

  // Los bordes visibles del período, para no anunciar tramos que el rango no
  // cubre: una semana cortada por el borde tiene que decir hasta dónde llega
  // de verdad, no de lunes a domingo.
  const primerDiaVisible = inicioDeCubo(marcaDe(range.fromInstant), "dia");
  const ultimoDiaVisible = inicioDeCubo(marcaDe(range.toInstant), "dia");

  const indice = new Map<string, number>();
  const acumulado = inicios.map((inicio, i) => {
    indice.set(inicio.toISOString(), i);

    const desdeVisible = new Date(Math.max(inicio.getTime(), primerDiaVisible.getTime()));
    // Un milisegundo antes del final natural: cae dentro del último día (o de
    // la última hora) que el cubo abarca, sea cual sea la granularidad.
    const hastaVisible = new Date(
      Math.min(finDeCubo(inicio, granularidad).getTime() - 1, ultimoDiaVisible.getTime())
    );
    const cobertura = coberturaDelCubo(inicio, granularidad, ventana);

    return {
      clave: inicio.toISOString(),
      etiqueta: etiquetaDe(desdeVisible, granularidad),
      detalle: detalleDe(desdeVisible, hastaVisible, granularidad),
      ordenes: 0,
      facturado: 0,
      sinDatos: cobertura <= 0,
      parcial: cobertura > 0 && cobertura < COMPLETO,
    };
  });

  for (const o of ordenes) {
    const pos = indice.get(inicioDeCubo(o.marca, granularidad).toISOString());
    if (pos === undefined) continue;
    acumulado[pos].ordenes += 1;
    acumulado[pos].facturado += o.neto;
  }

  const cubos: CuboVentas[] = acumulado.map(({ facturado, ...resto }) =>
    verCifras ? { ...resto, facturado } : resto
  );

  return {
    granularidad,
    cubos,
    sinDatos: cubos.filter((c) => c.sinDatos).length,
    parciales: cubos.filter((c) => c.parcial).length,
  };
}
