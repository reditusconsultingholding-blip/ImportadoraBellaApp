import { db } from "@/lib/db";
import { normalizarNombre } from "@/lib/enlace-shopify";

// Los pedidos reales, contados como los cuenta el equipo.
//
// LA REGLA: UN PEDIDO ES DE UN PRODUCTO
// Un pedido de Shopify trae varias líneas —la faja, el envío prioritario, un
// cepillo de upsell—. Contar líneas o unidades infla el número: el mismo
// cliente, en la misma compra, aparecería como tres pedidos. El equipo cuenta
// pedidos, uno por compra, a nombre del producto que se vendió.
//
// Por eso cada pedido se asigna a UN producto: el de su línea de mayor importe
// entre las que están enlazadas. Así la suma de los productos más los pedidos
// sin asignar da exactamente los pedidos de la tienda, sin contar dos veces.
//
// QUÉ NO SE CUENTA
//   - Las líneas marcadas como "ignorar" (envío prioritario, garantías) no
//     deciden a qué producto pertenece un pedido.
//   - Un pedido cuyo único producto es de TESTEO no se cuenta: el equipo no lo
//     suma en los pedidos del mes, es "netamente un gasto".
//
// POR QUÉ SE NORMALIZA EN JAVASCRIPT
// Los nombres se cruzan con `normalizarNombre`, la misma función con la que se
// guardaron los enlaces. Tenerla una vez en JavaScript y otra en SQL es la
// forma más silenciosa de que un día dejen de cuadrar los números. Como hay
// pocos nombres distintos (cientos, no miles), se resuelven acá y se le pasan
// a la consulta ya clasificados.

export type ClaseNombre = "producto" | "testeo" | "ignorar" | "sin";

// Los nombres distintos de TODA la historia salen de recorrer más de 130.000
// renglones: 1,7 s, y se pedía en cada vuelta del reloj. Se guardan una hora
// en memoria y en cada llamada se les suman los de los últimos 7 días, que es
// lo único que puede traer un nombre nuevo: el sync de Shopify solo reescribe
// los pedidos de los últimos días. Esa segunda consulta va por índices y
// tarda milisegundos.
const NOMBRES_VIGENCIA_MS = 60 * 60 * 1000;
const nombresEnMemoria = new Map<string, { hasta: number; nombres: string[] }>();

async function nombresDistintos(organizationId: string): Promise<{ nombre: string }[]> {
  const guardado = nombresEnMemoria.get(organizationId);
  const recientes = db.$queryRaw<{ nombre: string }[]>`
    SELECT DISTINCT li."productName" AS nombre
      FROM "ShopifyOrder" o
      JOIN "ShopifyStore" s ON s.id = o."storeId"
      JOIN "ShopifyOrderLineItem" li ON li."orderId" = o.id
     WHERE s."organizationId" = ${organizationId}
       AND o."occurredAt" >= now() - interval '7 days'`;

  let todos: string[];
  if (guardado && guardado.hasta > Date.now()) {
    todos = guardado.nombres;
  } else {
    const filas = await db.$queryRaw<{ nombre: string }[]>`
      SELECT DISTINCT li."productName" AS nombre
        FROM "ShopifyOrderLineItem" li
        JOIN "ShopifyOrder" o ON o.id = li."orderId"
        JOIN "ShopifyStore" s ON s.id = o."storeId"
       WHERE s."organizationId" = ${organizationId}`;
    todos = filas.map((f) => f.nombre);
    nombresEnMemoria.set(organizationId, { hasta: Date.now() + NOMBRES_VIGENCIA_MS, nombres: todos });
  }
  const union = new Set(todos);
  for (const r of await recientes) union.add(r.nombre);
  return [...union].map((nombre) => ({ nombre }));
}

/** Clasifica cada nombre de línea de pedido distinto de la organización. */
async function clasificarNombres(organizationId: string) {
  const [nombres, enlaces, excluidos] = await Promise.all([
    nombresDistintos(organizationId),
    db.productoShopify.findMany({
      where: { organizationId },
      select: { nombreNorm: true, productId: true },
    }),
    db.nombreShopifyExcluido.findMany({
      where: { organizationId },
      select: { nombreNorm: true, motivo: true },
    }),
  ]);

  const productoDe = new Map(enlaces.map((e) => [e.nombreNorm, e.productId]));
  const motivoDe = new Map(excluidos.map((e) => [e.nombreNorm, e.motivo]));

  const salida: { nombre: string; clase: ClaseNombre; productId: string | null }[] = [];
  for (const { nombre } of nombres) {
    const k = normalizarNombre(nombre);
    const productId = productoDe.get(k) ?? null;
    const motivo = motivoDe.get(k);
    // El enlace a un producto gana sobre la exclusión: si alguien enlazó a
    // mano, es una decisión más reciente y más específica que la regla.
    const clase: ClaseNombre = productId
      ? "producto"
      : motivo === "testeo"
        ? "testeo"
        : motivo === "ignorar"
          ? "ignorar"
          : "sin";
    salida.push({ nombre, clase, productId });
  }
  return salida;
}

export type PedidosDelDia = {
  /** Marca de medianoche UTC del día de Ecuador. */
  fecha: Date;
  porProducto: Map<string, number>;
  /** Pedidos reales cuyo producto todavía no está enlazado. */
  sinAsignar: number;
  /** Pedidos de TESTEO: existen, pero no se cuentan. */
  testeo: number;
};

/**
 * Pedidos reales por día de Ecuador y por producto, entre dos instantes.
 *
 * Una sola consulta para todo el rango: el relleno histórico recorre catorce
 * meses y no puede hacer una consulta por día.
 */
export async function pedidosRealesPorDia(
  organizationId: string,
  desde: Date,
  hasta: Date,
): Promise<PedidosDelDia[]> {
  const clasificados = await clasificarNombres(organizationId);
  if (clasificados.length === 0) return [];

  const nombres = clasificados.map((c) => c.nombre);
  const clases = clasificados.map((c) => c.clase);
  const productos = clasificados.map((c) => c.productId ?? "");

  // Por pedido se elige una línea con esta prioridad:
  //   1. un producto enlazado (el de mayor importe),
  //   2. si no hay ninguno, una línea sin enlazar —el pedido es real, solo
  //      falta decir de qué producto es—,
  //   3. si solo hay testeo, testeo,
  //   4. si solo hay líneas a ignorar (un envío suelto), cuenta como sin
  //      asignar: el pedido existió.
  const filas = await db.$queryRaw<
    { fecha: Date; clase: ClaseNombre; productId: string; pedidos: number }[]
  >`
    WITH mapa AS (
      SELECT * FROM unnest(${nombres}::text[], ${clases}::text[], ${productos}::text[])
        AS m(nombre, clase, "productId")
    ),
    lineas AS (
      SELECT o.id AS "orderId",
             date_trunc('day', o."occurredAt" - interval '5 hours') AS fecha,
             m.clase, m."productId", li.amount
        FROM "ShopifyOrderLineItem" li
        JOIN "ShopifyOrder" o ON o.id = li."orderId"
        JOIN "ShopifyStore" s ON s.id = o."storeId"
        JOIN mapa m ON m.nombre = li."productName"
       WHERE s."organizationId" = ${organizationId}
         AND o."occurredAt" >= ${desde}
         AND o."occurredAt" <  ${hasta}
    ),
    principal AS (
      SELECT DISTINCT ON ("orderId") "orderId", fecha, clase, "productId"
        FROM lineas
       ORDER BY "orderId",
                CASE clase WHEN 'producto' THEN 0 WHEN 'sin' THEN 1 WHEN 'testeo' THEN 2 ELSE 3 END,
                amount DESC
    )
    SELECT fecha,
           CASE WHEN clase = 'ignorar' THEN 'sin' ELSE clase END AS clase,
           "productId",
           count(*)::int AS pedidos
      FROM principal
     GROUP BY 1, 2, 3`;

  const porDia = new Map<string, PedidosDelDia>();
  for (const f of filas) {
    // date_trunc sobre la hora de Ecuador ya da el día correcto; se lee como
    // marca UTC de medianoche, que es el formato del resto de las fechas.
    const fecha = new Date(
      Date.UTC(f.fecha.getUTCFullYear(), f.fecha.getUTCMonth(), f.fecha.getUTCDate()),
    );
    const clave = fecha.toISOString();
    const d = porDia.get(clave) ?? { fecha, porProducto: new Map(), sinAsignar: 0, testeo: 0 };
    const n = Number(f.pedidos) || 0;
    if (f.clase === "producto" && f.productId) {
      d.porProducto.set(f.productId, (d.porProducto.get(f.productId) ?? 0) + n);
    } else if (f.clase === "testeo") {
      d.testeo += n;
    } else {
      d.sinAsignar += n;
    }
    porDia.set(clave, d);
  }
  return [...porDia.values()].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
}

/** Cuántos pedidos y cuántos nombres faltan enlazar, para el aviso en pantalla. */
export async function coberturaDeEnlaces(organizationId: string, desde: Date, hasta: Date) {
  const dias = await pedidosRealesPorDia(organizationId, desde, hasta);
  let asignados = 0;
  let sinAsignar = 0;
  let testeo = 0;
  for (const d of dias) {
    for (const n of d.porProducto.values()) asignados += n;
    sinAsignar += d.sinAsignar;
    testeo += d.testeo;
  }
  const total = asignados + sinAsignar;
  return { asignados, sinAsignar, testeo, total, proporcion: total > 0 ? asignados / total : 1 };
}
