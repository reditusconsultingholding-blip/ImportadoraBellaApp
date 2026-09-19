import { db } from "@/lib/db";
import { pedidosRealesPorDia } from "@/lib/pedidos-reales";
import { filasDelDia, plataformaPorDia } from "@/lib/control-relleno";
import { ETIQUETA_SIN_ASIGNAR, HORAS_CORTE } from "@/lib/control-opciones";
import { cpa, economiaDeFila, repartoAdministrativo, sumarFilas, utilidad } from "@/lib/control-calculo";
import { memorizar } from "@/lib/memoria";
import type {
  Control,
  ControlPeriodo,
  FilaControl,
  FilaPeriodo,
  FilaResumen,
  PuntoDia,
  Totales,
} from "@/lib/control-opciones";

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

  // Lo que dicen las plataformas —con las campañas sin producto incluidas— y
  // los pedidos reales de la tienda desde la medianoche hasta el corte.
  const [plataforma, reales] = await Promise.all([
    plataformaPorDia(organizationId, dia, dia),
    pedidosRealesPorDia(organizationId, instanteDelCorte(dia, 0), hasta),
  ]);
  const { productos, sinAsignar } = filasDelDia(
    organizationId,
    dia,
    corte,
    plataforma.get(dia.toISOString()) ?? [],
    reales.find((r) => r.fecha.getTime() === dia.getTime()),
  );

  for (const f of productos) {
    const datos = { pedidos: f.pedidos, gasto: f.gasto, pedidosReales: f.pedidosReales };
    await db.cortePublicitario.upsert({
      where: {
        organizationId_productId_fecha_hora: {
          organizationId,
          productId: f.productId,
          fecha: dia,
          hora: corte,
        },
      },
      create: { ...f },
      update: datos,
    });
  }
  const datosSin = {
    gasto: sinAsignar.gasto,
    pedidosPlataforma: sinAsignar.pedidosPlataforma,
    pedidosReales: sinAsignar.pedidosReales,
  };
  await db.corteSinAsignar.upsert({
    where: { organizationId_fecha_hora: { organizationId, fecha: dia, hora: corte } },
    create: { ...sinAsignar },
    update: datosSin,
  });

  return { hora: corte, dia: dia.toISOString().slice(0, 10), productos: productos.length };
}

/* --------------------------- Leer el control ----------------------------- */

function sumar(filas: Parameters<typeof sumarFilas>[0]): Totales {
  return sumarFilas(filas);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const claveMes = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;

/**
 * El control de un período, calculado sobre los cortes guardados.
 *
 * LOS NÚMEROS QUE MANDAN
 * - Pedidos: los reales de la tienda, uno por compra, sin testeo.
 * - Gasto: TODO lo que cobraron las plataformas, con o sin producto. Lo que no
 *   tiene producto va a su propia fila; no desaparece.
 *
 * EL GASTO ADMINISTRATIVO
 * El total del mes se divide entre treinta y cada día se reparte entre las
 * filas en proporción a sus pedidos, incluida la de sin asignar: es un costo
 * de la empresa y tiene que quedar entero en la cuenta. Con un filtro por
 * producto, la proporción se sigue sacando contra el total del día —si no,
 * filtrar un producto le cargaría la administración de todos.
 */
async function controlDelPeriodoSinMemoria(
  organizationId: string,
  opciones: { desde: Date; hasta: Date; hora?: number; productIds?: string[] },
): Promise<ControlPeriodo> {
  const { desde, hasta, hora = 23 } = opciones;
  const filtro = opciones.productIds?.length ? opciones.productIds : undefined;

  const [cortes, sinAsignar, gastosAdm, totalesDelDia, testeo] = await Promise.all([
    db.cortePublicitario.findMany({
      where: {
        organizationId,
        fecha: { gte: desde, lte: hasta },
        hora,
        ...(filtro ? { productId: { in: filtro } } : {}),
      },
      select: {
        fecha: true,
        pedidos: true,
        gasto: true,
        pedidosReales: true,
        productId: true,
        product: { select: { name: true, code: true } },
      },
    }),
    filtro
      ? Promise.resolve([])
      : db.corteSinAsignar.findMany({
          where: { organizationId, fecha: { gte: desde, lte: hasta }, hora },
          select: { fecha: true, gasto: true, pedidosPlataforma: true, pedidosReales: true },
        }),
    db.gastoAdmMes.findMany({ where: { organizationId }, select: { anio: true, mes: true, valor: true } }),
    // Los pedidos de TODO el día, filtrado o no, para repartir el gasto adm.
    db.$queryRaw<{ fecha: Date; pedidos: number }[]>`
      SELECT fecha, sum(p)::int AS pedidos FROM (
        SELECT fecha, "pedidosReales" AS p FROM "CortePublicitario"
         WHERE "organizationId" = ${organizationId} AND hora = ${hora}
           AND fecha >= ${desde} AND fecha <= ${hasta}
        UNION ALL
        SELECT fecha, "pedidosReales" AS p FROM "CorteSinAsignar"
         WHERE "organizationId" = ${organizationId} AND hora = ${hora}
           AND fecha >= ${desde} AND fecha <= ${hasta}
      ) t GROUP BY fecha`,
    // Cuántos pedidos de testeo hubo, solo para avisarlo: no entran en la cuenta.
    pedidosRealesPorDia(
      organizationId,
      new Date(desde.getTime() + 5 * 3600_000),
      new Date(hasta.getTime() + 29 * 3600_000),
    ).then((dias) => dias.reduce((a, d) => a + d.testeo, 0)),
  ]);

  const admDe = new Map(gastosAdm.map((g) => [`${g.anio}-${g.mes}`, g.valor]));
  const pedidosDelDia = new Map(totalesDelDia.map((t) => [iso(t.fecha), Number(t.pedidos) || 0]));

  // Una consulta de economía por mes del rango, no una por fila.
  const meses = new Set<string>();
  for (let d = new Date(desde); d <= hasta; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    meses.add(claveMes(d));
  }
  const economias = new Map<string, Map<string, Economia>>();
  for (const clave of meses) {
    const [anio, mes] = clave.split("-").map(Number);
    economias.set(clave, await economiaDelMes(organizationId, anio, mes));
  }

  const mesesSinGastoAdm = new Set<string>();
  const repartoAdm = (fecha: Date, pedidos: number) => {
    const total = admDe.get(claveMes(fecha));
    if (total === undefined) {
      mesesSinGastoAdm.add(claveMes(fecha));
      return 0;
    }
    return repartoAdministrativo(total, pedidosDelDia.get(iso(fecha)) ?? 0, pedidos);
  };

  const filas: FilaControl[] = cortes.map((c) => {
    const e = economias.get(claveMes(c.fecha))?.get(c.productId);
    const pedidos = c.pedidosReales;
    const { efectividad, pedidosEfectivos, gastosOperativos, precioProm, ingresos } = economiaDeFila(pedidos, e);
    const gastosAdmFila = repartoAdm(c.fecha, pedidos);
    return {
      fecha: iso(c.fecha),
      hora,
      productId: c.productId,
      producto: c.product.name,
      codigo: c.product.code,
      pedidos,
      pedidosPlataforma: c.pedidos,
      cpa: cpa(c.gasto, pedidos),
      gasto: c.gasto,
      efectividad,
      pedidosEfectivos,
      gastosOperativos,
      precioProm,
      ingresos,
      gastosAdm: gastosAdmFila,
      utilidad: utilidad(ingresos, c.gasto, gastosOperativos, gastosAdmFila),
      economiaDelMes: Boolean(e?.delMes),
    };
  });

  // Lo sin asignar: gasto que se pagó y pedidos que existieron, sin producto
  // del que sacar precio ni costo. Sus ingresos no se inventan: quedan en cero
  // y el aviso lo dice, para que el número empuje a terminar los enlaces y no
  // a creer que ese gasto rindió nada.
  const filasSin: FilaControl[] = sinAsignar.map((s) => {
    const gastosAdmFila = repartoAdm(s.fecha, s.pedidosReales);
    return {
      fecha: iso(s.fecha),
      hora,
      productId: null,
      producto: ETIQUETA_SIN_ASIGNAR,
      codigo: "",
      pedidos: s.pedidosReales,
      pedidosPlataforma: s.pedidosPlataforma,
      cpa: 0,
      gasto: s.gasto,
      efectividad: 0,
      pedidosEfectivos: 0,
      gastosOperativos: 0,
      precioProm: 0,
      ingresos: 0,
      gastosAdm: gastosAdmFila,
      utilidad: utilidad(0, s.gasto, 0, gastosAdmFila),
      economiaDelMes: true,
    };
  });

  // Por producto, sumado sobre el período.
  const acumular = (lista: FilaControl[]) => {
    const porClave = new Map<string, FilaPeriodo & { _efectividadPonderada: number }>();
    for (const f of lista) {
      const clave = f.productId ?? "__sin__";
      const a = porClave.get(clave) ?? {
        productId: f.productId,
        producto: f.producto,
        codigo: f.codigo,
        pedidos: 0,
        pedidosPlataforma: 0,
        cpa: 0,
        gasto: 0,
        efectividad: 0,
        pedidosEfectivos: 0,
        gastosOperativos: 0,
        ingresos: 0,
        gastosAdm: 0,
        utilidad: 0,
        margen: 0,
        dias: 0,
        economiaDelMes: true,
        _efectividadPonderada: 0,
      };
      a.pedidos += f.pedidos;
      a.pedidosPlataforma += f.pedidosPlataforma;
      a.gasto += f.gasto;
      a.pedidosEfectivos += f.pedidosEfectivos;
      a.gastosOperativos += f.gastosOperativos;
      a.ingresos += f.ingresos;
      a.gastosAdm += f.gastosAdm;
      a.utilidad += f.utilidad;
      a._efectividadPonderada += f.efectividad * f.pedidos;
      if (f.pedidos > 0 || f.gasto > 0) a.dias += 1;
      if (!f.economiaDelMes) a.economiaDelMes = false;
      porClave.set(clave, a);
    }
    return [...porClave.values()].map(({ _efectividadPonderada, ...a }) => ({
      ...a,
      cpa: a.pedidos > 0 ? a.gasto / a.pedidos : 0,
      margen: a.ingresos > 0 ? a.utilidad / a.ingresos : 0,
      efectividad: a.pedidos > 0 ? _efectividadPonderada / a.pedidos : 0,
    }));
  };

  const productos = acumular(filas).sort((a, b) => b.utilidad - a.utilidad);
  const sin = filasSin.length ? acumular(filasSin)[0] : null;

  // La línea de tiempo del período, día por día, con todo junto.
  const porDiaMapa = new Map<string, PuntoDia>();
  for (const f of [...filas, ...filasSin]) {
    const p = porDiaMapa.get(f.fecha) ?? { fecha: f.fecha, pedidos: 0, gasto: 0, ingresos: 0, utilidad: 0 };
    p.pedidos += f.pedidos;
    p.gasto += f.gasto;
    p.ingresos += f.ingresos;
    p.utilidad += f.utilidad;
    porDiaMapa.set(f.fecha, p);
  }

  return {
    productos,
    sinAsignar: sin,
    totales: sumar([...filas, ...filasSin]),
    porDia: [...porDiaMapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    filas: [...filas, ...filasSin].sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || b.utilidad - a.utilidad,
    ),
    avisos: {
      mesesSinGastoAdm: [...mesesSinGastoAdm].sort(),
      productosSinEconomia: productos.filter((p) => !p.economiaDelMes && p.pedidos > 0).length,
      pedidosSinAsignar: sin?.pedidos ?? 0,
      pedidosTesteo: testeo,
    },
  };
}

// Cálculos pesados compartidos hasta la próxima escritura en la base.
// Ver src/lib/memoria.ts.
export const controlDelPeriodo = memorizar("control-publicitario.controlDelPeriodo", controlDelPeriodoSinMemoria);
