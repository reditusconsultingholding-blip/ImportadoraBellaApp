import { db } from "@/lib/db";
import { pedidosRealesPorDia, type PedidosDelDia } from "@/lib/pedidos-reales";

// Escribir los cortes del control publicitario: el corte en vivo de cada hora
// y el relleno del cierre de los días que ya pasaron.
//
// Los cortes de las 8, las 11 y las 4 no se pueden reconstruir: las
// plataformas devuelven el total del día y nadie guardó lo que llevaban a
// media mañana. El de las 23 sí, porque es el día entero y eso quedó guardado
// en MetricSnapshot desde que la app sincroniza.

/**
 * Marca de medianoche de Ecuador para un INSTANTE real.
 *
 * Solo para fechas con hora de verdad, como `new Date()`.
 */
export function diaEcuador(instante: Date) {
  const local = new Date(instante.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * La misma fecha, truncada, SIN correr la zona horaria.
 *
 * `MetricSnapshot.capturedAt` no es un instante: ya es la marca del día a
 * medianoche UTC, igual que `TareaDiaria.fecha`. Restarle las cinco horas de
 * Ecuador —como sí hay que hacerle a un instante— la manda al día anterior, y
 * entonces todo el control aparece corrido: los 198 pedidos del martes se
 * muestran el lunes. Cuesta ver porque el total del mes sigue dando bien.
 */
function marcaDeDia(fecha: Date) {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

/** Gasto y compras atribuidas de un día, por producto; `null` es sin producto. */
export type PlataformaDelDia = { productId: string | null; pedidos: number; gasto: number };

/**
 * Lo que dicen Meta y TikTok, por día y por producto.
 *
 * Incluye las campañas SIN producto (productId null). Antes se filtraban, y el
 * control de julio mostraba $35.841 de gasto cuando las plataformas habían
 * cobrado $43.582: faltaban 58 campañas sin código, casi todas de testeo. Ese
 * gasto se pagó; tiene que estar en la cuenta aunque no tenga producto.
 */
export async function plataformaPorDia(
  organizationId: string,
  desde?: Date,
  hasta?: Date,
): Promise<Map<string, PlataformaDelDia[]>> {
  const filas = await db.$queryRaw<
    { fecha: Date; productId: string | null; pedidos: number; gasto: number }[]
  >`
    SELECT m."capturedAt"                          AS fecha,
           c."productId"                           AS "productId",
           coalesce(sum(m."purchases"), 0)::int    AS pedidos,
           coalesce(sum(m."spend"), 0)::float8     AS gasto
      FROM "MetricSnapshot" m
      JOIN "Campaign" c ON c.id = m."campaignId"
      JOIN "AdAccount" a ON a.id = c."adAccountId"
     WHERE a."organizationId" = ${organizationId}
       AND (${desde ?? null}::timestamp IS NULL OR m."capturedAt" >= ${desde ?? null}::timestamp)
       AND (${hasta ?? null}::timestamp IS NULL OR m."capturedAt" <= ${hasta ?? null}::timestamp)
     GROUP BY m."capturedAt", c."productId"
  `;
  const porDia = new Map<string, PlataformaDelDia[]>();
  for (const f of filas) {
    const clave = marcaDeDia(f.fecha).toISOString();
    const lista = porDia.get(clave) ?? [];
    lista.push({ productId: f.productId, pedidos: Number(f.pedidos) || 0, gasto: Number(f.gasto) || 0 });
    porDia.set(clave, lista);
  }
  return porDia;
}

type FilaCorte = {
  organizationId: string;
  productId: string;
  fecha: Date;
  hora: number;
  pedidos: number;
  gasto: number;
  pedidosReales: number;
};
type FilaSinAsignar = {
  organizationId: string;
  fecha: Date;
  hora: number;
  gasto: number;
  pedidosPlataforma: number;
  pedidosReales: number;
};

/** Arma las filas de un día a partir de lo que dijo cada fuente. */
export function filasDelDia(
  organizationId: string,
  fecha: Date,
  hora: number,
  plataforma: PlataformaDelDia[],
  reales: PedidosDelDia | undefined,
): { productos: FilaCorte[]; sinAsignar: FilaSinAsignar } {
  const porProducto = new Map<string, FilaCorte>();
  const sinAsignar: FilaSinAsignar = {
    organizationId,
    fecha,
    hora,
    gasto: 0,
    pedidosPlataforma: 0,
    pedidosReales: reales?.sinAsignar ?? 0,
  };

  for (const p of plataforma) {
    if (!p.productId) {
      sinAsignar.gasto += p.gasto;
      sinAsignar.pedidosPlataforma += p.pedidos;
      continue;
    }
    porProducto.set(p.productId, {
      organizationId,
      productId: p.productId,
      fecha,
      hora,
      pedidos: p.pedidos,
      gasto: p.gasto,
      pedidosReales: 0,
    });
  }
  for (const [productId, n] of reales?.porProducto ?? []) {
    const f = porProducto.get(productId) ?? {
      organizationId,
      productId,
      fecha,
      hora,
      pedidos: 0,
      gasto: 0,
      pedidosReales: 0,
    };
    f.pedidosReales = n;
    porProducto.set(productId, f);
  }
  return { productos: [...porProducto.values()], sinAsignar };
}

export type ResultadoRelleno = {
  dias: number;
  filas: number;
  desde: string | null;
  hasta: string | null;
};

/**
 * Rehace el corte de cierre de los días que ya terminaron.
 *
 * `rehacer` borra y vuelve a escribir. Se usa todos los días sobre la última
 * semana, y no es un capricho: Meta y TikTok siguen atribuyendo compras días
 * después. El cierre tomado en vivo a las 23:00 del martes se queda corto, y
 * el viernes ese mismo martes ya tiene su número real.
 *
 * Nunca toca el día en curso: un "cierre" de un día que todavía no cerró sería
 * un número a medias con nombre de definitivo. Ese lo escribe el corte de las
 * 23 cuando llegue la hora.
 *
 * Escribe en bloque (borrar el rango y crear de a miles) en vez de una fila por
 * vez: con catorce meses de historia, fila por fila tardaba once minutos.
 */
export async function rellenarCierres(
  organizationId: string,
  opciones: { desde?: Date; rehacer?: boolean } = {},
): Promise<ResultadoRelleno> {
  const { desde, rehacer = false } = opciones;
  const hoy = diaEcuador(new Date());
  const desdeDia = desde ? marcaDeDia(desde) : undefined;

  const [plataforma, reales] = await Promise.all([
    plataformaPorDia(organizationId, desdeDia),
    pedidosRealesPorDia(
      organizationId,
      desdeDia ? new Date(desdeDia.getTime() + 5 * 3600_000) : new Date("2000-01-01T00:00:00Z"),
      new Date(hoy.getTime() + 5 * 3600_000),
    ),
  ]);
  const realesDe = new Map(reales.map((r) => [r.fecha.toISOString(), r]));

  const claves = new Set<string>([...plataforma.keys(), ...realesDe.keys()]);
  const productos: FilaCorte[] = [];
  const sinAsignar: FilaSinAsignar[] = [];
  const dias = new Set<string>();

  for (const clave of claves) {
    const fecha = new Date(clave);
    if (fecha >= hoy) continue;
    if (desdeDia && fecha < desdeDia) continue;
    const d = filasDelDia(organizationId, fecha, 23, plataforma.get(clave) ?? [], realesDe.get(clave));
    productos.push(...d.productos);
    sinAsignar.push(d.sinAsignar);
    dias.add(clave.slice(0, 10));
  }

  const rango = {
    organizationId,
    hora: 23,
    fecha: { ...(desdeDia ? { gte: desdeDia } : {}), lt: hoy },
  };

  // Todo en una transacción: entre el borrado y la reinserción, quien tuviera
  // el control abierto vería el período vacío. Con la transacción, ve los
  // números viejos hasta el instante en que aparecen los nuevos.
  //
  // Sin `rehacer` se respeta lo que ya estaba: skipDuplicates no pisa filas
  // existentes, que es justo el comportamiento pedido.
  const LOTE = 2000;
  await db.$transaction(
    async (tx) => {
      if (rehacer) {
        await tx.cortePublicitario.deleteMany({ where: rango });
        await tx.corteSinAsignar.deleteMany({ where: rango });
      }
      for (let i = 0; i < productos.length; i += LOTE) {
        await tx.cortePublicitario.createMany({ data: productos.slice(i, i + LOTE), skipDuplicates: true });
      }
      for (let i = 0; i < sinAsignar.length; i += LOTE) {
        await tx.corteSinAsignar.createMany({ data: sinAsignar.slice(i, i + LOTE), skipDuplicates: true });
      }
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  const ordenados = [...dias].sort();
  return {
    dias: dias.size,
    filas: productos.length,
    desde: ordenados[0] ?? null,
    hasta: ordenados[ordenados.length - 1] ?? null,
  };
}

/**
 * El repaso de una vez al día, con su propia guarda.
 *
 * Mirar catorce meses de métricas y reescribir cientos de filas cada cinco
 * minutos no le sirve a nadie: los números de anteayer no cambian tres veces
 * en una hora. Corre de madrugada, cuando las plataformas ya consolidaron el
 * día anterior, y una sola vez por día de Ecuador.
 *
 * La guarda es la misma que usan los otros trabajos diarios: una fila en
 * SyncState con la fecha del último repaso. Se compara contra el día
 * ecuatoriano y no contra "hace 24 horas", para que un repaso que salió tarde
 * un día no bloquee el del día siguiente.
 */
export async function repasoDiarioDeCierres(organizationId: string) {
  const FUENTE = "repaso-cierres";
  const HORA = 6;
  const DIAS_ATRAS = 7;

  const ahora = new Date();
  if (new Date(ahora.getTime() - 5 * 3600_000).getUTCHours() < HORA) return null;

  const hoy = diaEcuador(ahora);
  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    select: { okAt: true },
  });
  if (estado?.okAt && diaEcuador(estado.okAt).getTime() === hoy.getTime()) return null;

  const desde = new Date(hoy.getTime() - DIAS_ATRAS * 86400_000);
  const r = await rellenarCierres(organizationId, { desde, rehacer: true });
  const detalle = `${r.filas} filas, ${r.dias} días`;

  await db.syncState.upsert({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    create: { organizationId, fuente: FUENTE, okAt: new Date(), detalle },
    update: { okAt: new Date(), detalle, error: null },
  });

  return detalle;
}

/* ------------------------- Recalcular tras un enlace ------------------------ */

// Los cortes guardan los pedidos reales tal como estaban al escribirse. Cuando
// alguien enlaza un nombre de Shopify a un producto, toda la historia de ese
// nombre tiene que moverse de "sin producto asignado" a su producto: si no, el
// enlace se hace y el número de julio no cambia, y parece que no funcionó.
//
// Se recalcula en segundo plano —tarda unos segundos— y no dentro del pedido
// de quien hizo clic. Si llegan varios enlaces seguidos, no se lanza un
// recálculo por cada uno: se hace uno, y si mientras tanto llegó otro, uno más
// al terminar. El último siempre ve todos los enlaces.

const enCurso = new Map<string, Promise<void>>();
const otraVez = new Set<string>();

export function programarRecalculo(organizationId: string) {
  if (enCurso.has(organizationId)) {
    otraVez.add(organizationId);
    return;
  }
  const trabajo = (async () => {
    do {
      otraVez.delete(organizationId);
      await rellenarCierres(organizationId, { rehacer: true });
    } while (otraVez.has(organizationId));
  })()
    .catch((err) => console.error("[control] recálculo de cierres:", err))
    .finally(() => enCurso.delete(organizationId));
  enCurso.set(organizationId, trabajo);
}
