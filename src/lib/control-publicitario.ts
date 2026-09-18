import { db } from "@/lib/db";
import { ventasRealesPorProducto } from "@/lib/enlace-shopify";
import type { Range } from "@/lib/date-range";
import { HORAS_CORTE } from "@/lib/control-opciones";
import type { Control, FilaControl, FilaResumen, Totales } from "@/lib/control-opciones";

// Las etiquetas y los tipos viven en control-opciones.ts —sin Prisma— para que
// las tablas, que son componentes de cliente, puedan importarlos sin arrastrar
// Prisma al navegador. Se reexportan desde acá para que quien ya usaba este
// módulo no tenga que cambiar de sitio.
export * from "@/lib/control-opciones";
export type { Control, FilaControl, FilaResumen, Totales };

// El control de gastos publicitarios: la planilla que el equipo cuadra a mano,
// hecha sola.
//
// DE DÓNDE SALE ESTO
// Del Excel de control publicitario de Importadora Bella, leído pestaña por
// pestaña. La cuenta es la suya, no una inventada:
//
//   pedidos efectivos = pedidos × efectividad
//   ingresos          = precio promedio × pedidos efectivos
//   gastos operativos = (producción + flete) × pedidos efectivos
//   gasto adm del día = total del mes ÷ 30, repartido entre los pedidos del corte
//   utilidad          = ingresos − gasto publicitario − operativos − adm
//
// UNA DIFERENCIA A PROPÓSITO
// En el archivo, la fórmula de gastos operativos es
// `(VLOOKUP(...,VARIABLES!C:K,5)+VLOOKUP(...,8))*pedidos efectivos`. Sobre ese
// rango, el índice 5 cae en CPA MIN y el 8 en % de devoluciones, así que suma
// $6,00 + 0,15 y da $6,15 por pedido para TODO el catálogo. Lo comprobamos en
// 35 productos de abril: sale $6,15 en los 35.
//
// Producción y flete son los índices 3 y 4, y van de $7,28 a $10,76 según el
// producto. Que el intento era ese lo confirman las pestañas viejas del
// proyecto anterior, donde la misma columna está escrita a mano como
// `=(12+11.5)*H` —producción más flete—. En abril, la diferencia es $10.828 de
// costo que no se estaba contando: un 28% de la utilidad del mes.
//
// Acá se usa producción + flete, por decisión de Sebastián del 18 de
// septiembre. Queda pendiente preguntarle a administración si el 15% de
// devoluciones tiene que descontarse de los ingresos; hoy, igual que en el
// archivo, no descuenta nada.

/** Cuántos días trae un mes a efectos del reparto administrativo. */
const DIAS_DEL_MES = 30;

/* ------------------------------- Fechas ---------------------------------- */

/** El día de Ecuador de un instante, como marca de medianoche UTC. */
export function diaEcuador(instante = new Date()) {
  const local = new Date(instante.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** La hora de Ecuador de un instante. */
export function horaEcuador(instante = new Date()) {
  return new Date(instante.getTime() - 5 * 3600_000).getUTCHours();
}

/** El instante exacto en que se cumple `hora` de Ecuador dentro de `dia`. */
function instanteDelCorte(dia: Date, hora: number) {
  return new Date(dia.getTime() + (hora + 5) * 3600_000);
}

/* ------------------------------ La economía ------------------------------ */

export type Economia = {
  efectividad: number;
  produccion: number;
  flete: number;
  precioProm: number;
  cpaMin: number | null;
  devoluciones: number | null;
  /** Si salió de una fila del mes o del respaldo de la ficha del producto. */
  delMes: boolean;
};

/**
 * La economía de cada producto para un mes.
 *
 * Si no hay fila cargada para ese mes se cae a la ficha del producto, que es
 * un solo juego de números para toda la historia. No es lo mismo —la
 * efectividad de un producto pasó de 58% en abril a 100% en julio— y por eso
 * la fila devuelta dice de dónde salió: una utilidad calculada con la ficha es
 * una estimación, no el número del mes.
 */
export async function economiaDelMes(
  organizationId: string,
  anio: number,
  mes: number,
): Promise<Map<string, Economia>> {
  const [filas, productos] = await Promise.all([
    db.variableProducto.findMany({
      where: { organizationId, anio, mes },
      select: {
        productId: true,
        efectividad: true,
        produccion: true,
        flete: true,
        precioProm: true,
        cpaMin: true,
        devoluciones: true,
      },
    }),
    db.product.findMany({
      where: { organizationId },
      select: {
        id: true,
        efectividad: true,
        devoluciones: true,
        flete: true,
        unitCost: true,
        salePrice: true,
        cpaTarget: true,
      },
    }),
  ]);

  const salida = new Map<string, Economia>();

  for (const p of productos) {
    salida.set(p.id, {
      efectividad: p.efectividad ?? 0,
      produccion: p.unitCost ?? 0,
      flete: p.flete ?? 0,
      precioProm: p.salePrice ?? 0,
      cpaMin: p.cpaTarget,
      devoluciones: p.devoluciones,
      delMes: false,
    });
  }

  for (const f of filas) {
    salida.set(f.productId, {
      efectividad: f.efectividad,
      produccion: f.produccion,
      flete: f.flete,
      precioProm: f.precioProm,
      cpaMin: f.cpaMin,
      devoluciones: f.devoluciones,
      delMes: true,
    });
  }

  return salida;
}

/* ---------------------------- Tomar la foto ------------------------------ */

export type ResultadoCorte = { hora: number; dia: string; productos: number };

/**
 * Guarda el estado del día a esta hora, por producto.
 *
 * Se llama desde el reloj. Es idempotente dentro de la misma hora: si el
 * servicio pasa dos veces a las 11, la segunda reescribe la fila con el dato
 * más fresco en vez de crear otra.
 *
 * Hay que tomarla en el momento porque no se puede reconstruir: Meta y TikTok
 * devuelven el total del día, nunca lo que llevaban a media mañana.
 */
export async function capturarCorte(
  organizationId: string,
  ahora = new Date(),
): Promise<ResultadoCorte | null> {
  const hora = horaEcuador(ahora);
  const corte = HORAS_CORTE.find((h) => h === hora);
  if (corte === undefined) return null;

  const dia = diaEcuador(ahora);
  const hasta = instanteDelCorte(dia, corte + 1); // el corte cubre la hora entera

  // Pedidos y gasto atribuidos por las plataformas, acumulados del día.
  const porPlataforma = await db.$queryRaw<
    { productId: string; pedidos: bigint; gasto: number }[]
  >`
    SELECT c."productId"                      AS "productId",
           COALESCE(SUM(m."purchases"), 0)    AS "pedidos",
           COALESCE(SUM(m."spend"), 0)        AS "gasto"
      FROM "MetricSnapshot" m
      JOIN "Campaign" c ON c."id" = m."campaignId"
      JOIN "AdAccount" a ON a."id" = c."adAccountId"
     WHERE a."organizationId" = ${organizationId}
       AND c."productId" IS NOT NULL
       AND m."capturedAt" = ${dia}
     GROUP BY c."productId"
  `;

  // Pedidos reales de la tienda, desde la medianoche de Ecuador hasta el corte.
  const rango: Range = {
    from: dia,
    to: dia,
    fromInstant: instanteDelCorte(dia, 0),
    toInstant: hasta,
    label: "corte",
    id: "personalizado",
  };
  const reales = await ventasRealesPorProducto(organizationId, rango);

  const ids = new Set<string>([...porPlataforma.map((p) => p.productId), ...reales.keys()]);
  if (ids.size === 0) return { hora: corte, dia: dia.toISOString().slice(0, 10), productos: 0 };

  const plataformaDe = new Map(porPlataforma.map((p) => [p.productId, p]));

  for (const productId of ids) {
    const p = plataformaDe.get(productId);
    const r = reales.get(productId);
    const datos = {
      pedidos: Number(p?.pedidos ?? 0),
      gasto: Number(p?.gasto ?? 0),
      pedidosReales: r?.unidades ?? 0,
    };
    await db.cortePublicitario.upsert({
      where: {
        organizationId_productId_fecha_hora: { organizationId, productId, fecha: dia, hora: corte },
      },
      create: { organizationId, productId, fecha: dia, hora: corte, ...datos },
      update: datos,
    });
  }

  return { hora: corte, dia: dia.toISOString().slice(0, 10), productos: ids.size };
}

/* --------------------------- Leer el control ----------------------------- */

function sumar(filas: FilaControl[]): Totales {
  const t = filas.reduce(
    (a, f) => {
      a.pedidos += f.pedidos;
      a.pedidosReales += f.pedidosReales;
      a.gasto += f.gasto;
      a.ingresos += f.ingresos;
      a.gastosOperativos += f.gastosOperativos;
      a.gastosAdm += f.gastosAdm;
      a.utilidad += f.utilidad;
      return a;
    },
    {
      pedidos: 0,
      pedidosReales: 0,
      gasto: 0,
      ingresos: 0,
      gastosOperativos: 0,
      gastosAdm: 0,
      utilidad: 0,
      cpa: 0,
      margen: 0,
    },
  );
  t.cpa = t.pedidos > 0 ? t.gasto / t.pedidos : 0;
  t.margen = t.ingresos > 0 ? t.utilidad / t.ingresos : 0;
  return t;
}

/**
 * Las filas del control entre dos días.
 *
 * `hora` filtra a un corte; sin ella vienen los cuatro. El reparto del gasto
 * administrativo se hace por día y por corte: el total del mes se divide entre
 * treinta y ese día se reparte entre los productos en proporción a sus
 * pedidos, que es exactamente lo que hace la planilla.
 */
export async function controlPublicitario(
  organizationId: string,
  opciones: { desde: Date; hasta: Date; hora?: number; productId?: string },
): Promise<Control> {
  const { desde, hasta, hora, productId } = opciones;

  const cortes = await db.cortePublicitario.findMany({
    where: {
      organizationId,
      fecha: { gte: desde, lte: hasta },
      ...(hora !== undefined ? { hora } : {}),
      ...(productId ? { productId } : {}),
    },
    orderBy: [{ fecha: "desc" }, { hora: "desc" }],
    select: {
      fecha: true,
      hora: true,
      pedidos: true,
      gasto: true,
      pedidosReales: true,
      productId: true,
      product: { select: { name: true, code: true } },
    },
  });

  if (cortes.length === 0) {
    return { filas: [], totales: sumar([]), sinEconomiaDelMes: 0, mesesSinGastoAdm: [] };
  }

  // Una consulta de economía por mes presente en el rango, no una por fila.
  const meses = new Set(
    cortes.map((c) => `${c.fecha.getUTCFullYear()}-${c.fecha.getUTCMonth() + 1}`),
  );
  const economias = new Map<string, Map<string, Economia>>();
  for (const clave of meses) {
    const [anio, mes] = clave.split("-").map(Number);
    economias.set(clave, await economiaDelMes(organizationId, anio, mes));
  }

  const gastosAdm = await db.gastoAdmMes.findMany({
    where: { organizationId },
    select: { anio: true, mes: true, valor: true },
  });
  const admDe = new Map(gastosAdm.map((g) => [`${g.anio}-${g.mes}`, g.valor]));

  // Para repartir el gasto administrativo hace falta el total de pedidos de
  // cada (día, corte) — incluyendo los productos que el filtro dejó fuera, o
  // filtrar por un producto le asignaría todo el gasto del día.
  const totalesDelCorte = await db.cortePublicitario.groupBy({
    by: ["fecha", "hora"],
    where: { organizationId, fecha: { gte: desde, lte: hasta } },
    _sum: { pedidos: true },
  });
  const pedidosDelCorte = new Map(
    totalesDelCorte.map((t) => [
      `${t.fecha.toISOString().slice(0, 10)}|${t.hora}`,
      t._sum.pedidos ?? 0,
    ]),
  );

  const mesesSinGastoAdm = new Set<string>();
  let sinEconomiaDelMes = 0;

  const filas: FilaControl[] = cortes.map((c) => {
    const anio = c.fecha.getUTCFullYear();
    const mes = c.fecha.getUTCMonth() + 1;
    const clave = `${anio}-${mes}`;
    const e = economias.get(clave)?.get(c.productId);

    const efectividad = e?.efectividad ?? 0;
    const pedidosEfectivos = c.pedidos * efectividad;
    const gastosOperativos = ((e?.produccion ?? 0) + (e?.flete ?? 0)) * pedidosEfectivos;
    const precioProm = e?.precioProm ?? 0;
    const ingresos = precioProm * pedidosEfectivos;

    const totalMes = admDe.get(clave);
    if (totalMes === undefined) mesesSinGastoAdm.add(clave);
    if (!e?.delMes) sinEconomiaDelMes += 1;

    const delDia = (totalMes ?? 0) / DIAS_DEL_MES;
    const pedidosTotales = pedidosDelCorte.get(
      `${c.fecha.toISOString().slice(0, 10)}|${c.hora}`,
    );
    const gastosAdmFila =
      pedidosTotales && pedidosTotales > 0 ? (c.pedidos / pedidosTotales) * delDia : 0;

    return {
      fecha: c.fecha.toISOString().slice(0, 10),
      hora: c.hora,
      productId: c.productId,
      producto: c.product.name,
      codigo: c.product.code,
      pedidos: c.pedidos,
      pedidosReales: c.pedidosReales,
      diferencia: c.pedidosReales - c.pedidos,
      cpa: c.pedidos > 0 ? c.gasto / c.pedidos : 0,
      gasto: c.gasto,
      efectividad,
      pedidosEfectivos,
      gastosOperativos,
      precioProm,
      ingresos,
      gastosAdm: gastosAdmFila,
      utilidad: ingresos - c.gasto - gastosOperativos - gastosAdmFila,
      economiaDelMes: Boolean(e?.delMes),
    };
  });

  return {
    filas,
    totales: sumar(filas),
    sinEconomiaDelMes,
    mesesSinGastoAdm: [...mesesSinGastoAdm].sort(),
  };
}

/* --------------------------- Resumen del mes ----------------------------- */

/**
 * El acumulado del mes por producto.
 *
 * Suma únicamente el corte de las 23, que es el día cerrado. Sumar los cuatro
 * cortes contaría el mismo día cuatro veces, porque cada uno es el acumulado
 * desde la medianoche y no un tramo.
 */
export async function resumenDelMes(organizationId: string, anio: number, mes: number) {
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(anio, mes, 0));

  const { filas } = await controlPublicitario(organizationId, { desde, hasta, hora: 23 });

  const porProducto = new Map<string, FilaResumen>();
  for (const f of filas) {
    const a = porProducto.get(f.productId) ?? {
      productId: f.productId,
      producto: f.producto,
      codigo: f.codigo,
      pedidos: 0,
      pedidosReales: 0,
      cpa: 0,
      ingresos: 0,
      gasto: 0,
      gastosOperativos: 0,
      gastosAdm: 0,
      utilidad: 0,
      margen: 0,
    };
    a.pedidos += f.pedidos;
    a.pedidosReales += f.pedidosReales;
    a.ingresos += f.ingresos;
    a.gasto += f.gasto;
    a.gastosOperativos += f.gastosOperativos;
    a.gastosAdm += f.gastosAdm;
    a.utilidad += f.utilidad;
    porProducto.set(f.productId, a);
  }

  const salida = [...porProducto.values()];
  for (const f of salida) {
    f.cpa = f.pedidos > 0 ? f.gasto / f.pedidos : 0;
    f.margen = f.ingresos > 0 ? f.utilidad / f.ingresos : 0;
  }
  salida.sort((a, b) => b.utilidad - a.utilidad);

  return { filas: salida, totales: sumar(filas) };
}
