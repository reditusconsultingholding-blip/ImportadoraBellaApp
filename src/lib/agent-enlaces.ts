import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { resolveRange, type RangeId } from "@/lib/date-range";
import { comparar, normalizarNombre } from "@/lib/enlace-shopify";
import { nombresSinEnlazar } from "@/lib/enlazar-pedidos";
import { shopifyVsAds } from "@/lib/shopify-vs-ads";
import { objetivosDeLaCalculadora } from "@/lib/economia-calculadora";
import { matchProduct, relinkCampaignsToProducts } from "@/lib/integrations/windsor-sync";
import { programarRecalculo } from "@/lib/control-relleno";
import { confirmarCambio, limpiarAlias, proponerCambio, type CambioPropuesto } from "@/lib/enlaces-chat";

// Lo que Emilia pidió en los audios del 23-nov: hablarle a Jarvis para unir
// nombres («la cápsula de hongos es reishi») y preguntarle «¿por qué me está
// saliendo esto?». Son tres herramientas: dos que solo miran y una que cambia
// la base, siempre con confirmación (ver enlaces-chat.ts).

const PERIODOS = ["hoy", "ayer", "7d", "30d", "3m", "6m", "9m", "12m"];
const periodo = { type: "string" as const, enum: PERIODOS, description: "Período a mirar. Por defecto 30d." };

export const HERRAMIENTAS_ENLACE: Anthropic.Tool[] = [
  {
    name: "revisar_producto",
    description:
      "Explica por qué un producto muestra lo que muestra en Shopify vs Ads, Riesgo y Control: con qué nombres de Shopify y de la planilla está unido, qué campañas le caen y por qué, de dónde sale su objetivo, y qué nombres o campañas sueltas se le parecen y quizá le faltan. Úsala ante «¿por qué me sale sin Shopify?», «¿por qué este número?», «¿de dónde sale el objetivo?».",
    input_schema: {
      type: "object",
      properties: { busqueda: { type: "string", description: "Código o parte del nombre del producto." }, periodo },
      required: ["busqueda"],
    },
  },
  {
    name: "pendientes_de_unir",
    description:
      "Lo que está suelto en el período: nombres de Shopify o de la planilla de ventas sin producto (con sus pedidos y la sugerencia, si hay una clara) y campañas sin producto (con su gasto).",
    input_schema: { type: "object", properties: { periodo } },
  },
  {
    name: "unir_nombre",
    description:
      "Une un nombre a un producto. tipo=shopify: un nombre de línea de pedido de Shopify o de la planilla («Tremella Hongo de la Belleza») pasa a contar en el producto. tipo=campana: un nombre que aparece en campañas sin código («VITAL DROP») se agrega a «Otros nombres en las campañas» del producto y esas campañas pasan a él. SIEMPRE en dos pasos: llámala sin codigo y te devuelve qué va a cambiar y un código; muéstraselo a la persona y pregúntale si confirma. Solo cuando ella diga que sí, en su mensaje siguiente, vuelve a llamarla con el mismo tipo, nombre y producto y el codigo. Nunca la llames con codigo en la misma respuesta en que lo recibiste.",
    input_schema: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["shopify", "campana"] },
        nombre: {
          type: "string",
          description: "El nombre tal cual aparece en Shopify/planilla (tipo=shopify) o la palabra que aparece en las campañas (tipo=campana).",
        },
        producto: { type: "string", description: "Código o nombre del producto destino." },
        codigo: { type: "string", description: "Solo en el segundo paso, después del sí de la persona." },
      },
      required: ["tipo", "nombre", "producto"],
    },
  },
];

export const NOMBRES_ENLACE = new Set(HERRAMIENTAS_ENLACE.map((h) => h.name));

export type ContextoEnlace = {
  organizationId: string;
  userId: string;
  /** Dirección con acceso a las cifras: lo mismo que pide la pantalla de enlaces. */
  puedeEnlazar: boolean;
  /** Id de esta respuesta del chat: lo propuesto en ella no se aplica en ella. */
  turno: string;
};

const num = (n: number | null | undefined, dec = 2) => (n == null ? null : Math.round(n * 10 ** dec) / 10 ** dec);

function dias(p: unknown) {
  const id = typeof p === "string" && PERIODOS.includes(p) ? (p as RangeId) : ("30d" as RangeId);
  const r = resolveRange(id);
  // shopifyVsAds y nombresSinEnlazar trabajan con días a medianoche UTC.
  return { desde: r.from, hasta: new Date(r.to.toISOString().slice(0, 10)), label: r.label };
}

async function buscarProductos(organizationId: string, busqueda: string) {
  const b = busqueda.trim();
  if (!b) return [];
  const exactos = await db.product.findMany({
    where: { organizationId, archived: false, OR: [{ code: { equals: b, mode: "insensitive" } }, { name: { equals: b, mode: "insensitive" } }] },
    take: 2,
  });
  if (exactos.length === 1) return exactos;
  // Sin tildes y también por los otros nombres: Emilia escribe «capsula
  // hongos» o «tremella» para «Cápsula hongos de nieve».
  const todos = await db.product.findMany({ where: { organizationId, archived: false } });
  const q = normalizarNombre(b);
  const contiene = todos.filter(
    (p) =>
      normalizarNombre(p.name).includes(q) ||
      normalizarNombre(p.code).includes(q) ||
      p.aliasCampanas.some((a) => normalizarNombre(a) === q),
  );
  if (contiene.length > 0) return contiene.slice(0, 6);
  return todos
    .map((p) => ({ p, ...comparar(b, p.name) }))
    .filter((x) => x.base >= 0.5)
    .sort((a, c) => c.base - a.base || c.solape - a.solape)
    .slice(0, 6)
    .map((x) => x.p);
}

/** Los nombres de pedido (Shopify y planilla) de los últimos 120 días, por nombre normalizado. */
async function nombresDePedidos(organizationId: string) {
  const desde = new Date(Date.now() - 120 * 86400_000);
  const [shopify, planilla] = await Promise.all([
    db.$queryRaw<{ nombre: string; pedidos: number }[]>`
      SELECT li."productName" AS nombre, count(DISTINCT li."orderId")::int AS pedidos
        FROM "ShopifyOrderLineItem" li
        JOIN "ShopifyOrder" o ON o.id = li."orderId"
        JOIN "ShopifyStore" s ON s.id = o."storeId"
       WHERE s."organizationId" = ${organizationId} AND o."occurredAt" >= ${desde}
       GROUP BY 1`,
    db.pedidoReporte.groupBy({
      by: ["productoTexto", "productoNorm"],
      where: { organizationId, fecha: { gte: desde } },
      _sum: { pedidos: true },
    }),
  ]);
  const porNorm = new Map<string, { nombre: string; pedidosShopify: number; pedidosPlanilla: number }>();
  for (const s of shopify) {
    const k = normalizarNombre(s.nombre);
    const x = porNorm.get(k) ?? { nombre: s.nombre, pedidosShopify: 0, pedidosPlanilla: 0 };
    x.pedidosShopify += Number(s.pedidos) || 0;
    porNorm.set(k, x);
  }
  for (const r of planilla) {
    const x = porNorm.get(r.productoNorm) ?? { nombre: r.productoTexto, pedidosShopify: 0, pedidosPlanilla: 0 };
    x.pedidosPlanilla += r._sum.pedidos ?? 0;
    porNorm.set(r.productoNorm, x);
  }
  return porNorm;
}

async function revisarProducto(ctx: ContextoEnlace, entrada: Record<string, unknown>) {
  const { organizationId } = ctx;
  const encontrados = await buscarProductos(organizationId, String(entrada.busqueda ?? ""));
  if (encontrados.length === 0) return { encontrado: false, busqueda: entrada.busqueda };
  if (encontrados.length > 1) {
    return {
      encontrado: false,
      variosCandidatos: encontrados.map((p) => ({ codigo: p.code, nombre: p.name })),
      nota: "Hay varios productos parecidos: pregunta cuál es.",
    };
  }
  const p = encontrados[0];
  const { desde, hasta, label } = dias(entrada.periodo);
  const mes = desde.toISOString().slice(0, 7) === hasta.toISOString().slice(0, 7) ? desde.toISOString().slice(0, 7) : null;

  const [cuadre, enlaces, campanas, pendientes, objetivosMes, objetivosHist, sueltas] = await Promise.all([
    shopifyVsAds(organizationId, desde, hasta),
    db.productoShopify.findMany({ where: { organizationId, productId: p.id }, select: { nombre: true, automatico: true } }),
    db.campaign.findMany({
      where: { productId: p.id, adAccount: { organizationId } },
      select: {
        name: true,
        productManual: true,
        adAccount: { select: { platform: true } },
        metrics: { where: { capturedAt: { gte: desde, lte: hasta } }, select: { spend: true, purchases: true } },
      },
    }),
    nombresSinEnlazar(organizationId, desde, hasta),
    mes ? objetivosDeLaCalculadora(organizationId, mes) : Promise.resolve(new Map<string, number>()),
    objetivosDeLaCalculadora(organizationId, null),
    db.$queryRaw<{ name: string; gasto: number }[]>`
      SELECT c.name, coalesce(sum(m.spend), 0)::float8 AS gasto
        FROM "Campaign" c
        JOIN "AdAccount" a ON a.id = c."adAccountId"
        JOIN "MetricSnapshot" m ON m."campaignId" = c.id
       WHERE a."organizationId" = ${organizationId} AND c."productId" IS NULL
         AND m."capturedAt" >= ${desde} AND m."capturedAt" <= ${hasta}
       GROUP BY c.name HAVING sum(m.spend) > 0`,
  ]);

  const fila = cuadre.productos.find((f) => f.productId === p.id) ?? null;
  const conGasto = campanas
    .map((c) => ({
      nombre: c.name,
      plataforma: c.adAccount.platform,
      gasto: c.metrics.reduce((s, m) => s + m.spend, 0),
      compras: c.metrics.reduce((s, m) => s + m.purchases, 0),
      asignadaAMano: c.productManual,
    }))
    .filter((c) => c.gasto > 0)
    .sort((a, b) => b.gasto - a.gasto);

  // Por qué cae cada campaña: código, código anterior, otro nombre o nombre.
  const porque = (nombre: string, manual: boolean) => {
    if (manual) return "asignada a mano";
    const N = nombre.toUpperCase();
    if (N.includes(p.code.toUpperCase())) return `lleva el código ${p.code}`;
    const ant = p.codigosAnteriores.find((c) => c && N.includes(c.toUpperCase()));
    if (ant) return `lleva el código anterior ${ant}`;
    const al = p.aliasCampanas.find((a) => normalizarNombre(nombre).includes(normalizarNombre(a)));
    if (al) return `contiene el otro nombre «${al}»`;
    return "contiene el nombre del producto";
  };

  const parecidosShopify = pendientes
    .filter((n) => n.sugerido?.id === p.id || comparar(n.nombre, p.name).base >= 0.5)
    .slice(0, 8)
    .map((n) => ({ nombre: n.nombre, pedidos: n.pedidos, fuente: n.fuente, sugeridoPara: n.sugerido?.name ?? null }));
  const palabrasProducto = [p.name, ...p.aliasCampanas];
  const parecidasCampanas = sueltas
    .filter((c) => palabrasProducto.some((x) => comparar(c.name, x).base >= 0.5))
    .sort((a, b) => b.gasto - a.gasto)
    .slice(0, 8)
    .map((c) => ({ nombre: c.name, gasto: num(c.gasto) }));

  const objCalc = objetivosMes.get(p.id) ?? objetivosHist.get(p.id) ?? null;
  const fuenteObjetivo = objetivosMes.has(p.id)
    ? `Calculadora de precios, mes ${mes}`
    : objetivosHist.has(p.id)
      ? "Calculadora de precios (histórico)"
      : p.economiaDe
        ? `Ficha del producto (${p.economiaDe})`
        : "ninguna: no está cargado en la Calculadora, así que no se muestra objetivo";

  const lecturas: string[] = [];
  if (fila && fila.shopify === 0 && fila.plataforma > 0) {
    lecturas.push(
      "Sale «sin Shopify»: Meta/TikTok se atribuyen compras pero en el período no hay pedidos de Shopify unidos a este producto. O no hubo pedidos (las plataformas atribuyen compras de días anteriores), o el pedido entró con un nombre que no está unido: mira nombresParecidosSinUnir.",
    );
  }
  if (!fila || fila.gasto === 0) lecturas.push("No tiene gasto de pauta unido en el período: mira campanasParecidasSinProducto.");
  if (fila && fila.ventas === 0 && fila.shopify > 0)
    lecturas.push("Tiene pedidos de Shopify pero ninguno en la planilla de ventas con un nombre unido a este producto.");

  return {
    periodo: label,
    producto: { codigo: p.code, nombre: p.name, etiquetas: p.etiquetas, testeoMeses: p.testeoMeses },
    enPantalla: fila
      ? {
          pedidosShopify: fila.shopify,
          comprasMeta: fila.meta,
          comprasTikTok: fila.tiktok,
          gasto: num(fila.gasto),
          cpaReal: num(fila.cpaReal),
          cpaPlataforma: num(fila.cpaPlataforma),
          ventasPlanilla: fila.ventas,
          confirmados: fila.confirmados,
          cpaObjetivo: num(fila.cpaObjetivo),
        }
      : null,
    objetivo: { valor: num(objCalc ?? (p.economiaDe ? p.cpaTarget : null)), fuente: fuenteObjetivo },
    comoSeUne: {
      codigo: p.code,
      codigosAnteriores: p.codigosAnteriores,
      otrosNombresEnCampanas: p.aliasCampanas,
      nombresShopifyUnidos: enlaces.map((e) => e.nombre),
      nota: "Además, un pedido cae solo si su nombre es exactamente el nombre o el código del producto.",
    },
    campanasDelPeriodo: conGasto.slice(0, 12).map((c) => ({
      nombre: c.nombre,
      plataforma: c.plataforma,
      gasto: num(c.gasto),
      compras: c.compras,
      porQueCae: porque(c.nombre, c.asignadaAMano),
    })),
    nombresParecidosSinUnir: parecidosShopify,
    campanasParecidasSinProducto: parecidasCampanas,
    lecturas,
  };
}

async function pendientesDeUnir(ctx: ContextoEnlace, entrada: Record<string, unknown>) {
  const { desde, hasta, label } = dias(entrada.periodo);
  const [nombres, campanas] = await Promise.all([
    nombresSinEnlazar(ctx.organizationId, desde, hasta),
    db.$queryRaw<{ name: string; platform: string; gasto: number; compras: number }[]>`
      SELECT c.name, a.platform::text AS platform,
             coalesce(sum(m.spend), 0)::float8 AS gasto, coalesce(sum(m.purchases), 0)::int AS compras
        FROM "Campaign" c
        JOIN "AdAccount" a ON a.id = c."adAccountId"
        JOIN "MetricSnapshot" m ON m."campaignId" = c.id
       WHERE a."organizationId" = ${ctx.organizationId} AND c."productId" IS NULL
         AND m."capturedAt" >= ${desde} AND m."capturedAt" <= ${hasta}
       GROUP BY c.name, a.platform HAVING sum(m.spend) > 0
       ORDER BY 3 DESC LIMIT 20`,
  ]);
  return {
    periodo: label,
    nombresSinProducto: nombres.slice(0, 20).map((n) => ({
      nombre: n.nombre,
      pedidos: n.pedidos,
      fuente: n.fuente,
      sugerido: n.sugerido ? `${n.sugerido.name} (${n.sugerido.code})` : null,
    })),
    totalNombresSinProducto: nombres.length,
    pedidosSinProducto: nombres.reduce((s, n) => s + n.pedidos, 0),
    campanasSinProducto: campanas.map((c) => ({ nombre: c.name, plataforma: c.platform, gasto: num(c.gasto), compras: Number(c.compras) })),
  };
}

/** Qué campañas cambiarían de producto si `productId` tuviera el alias. */
async function simularAlias(organizationId: string, alias: string, productId: string) {
  const [productos, campanas] = await Promise.all([
    db.product.findMany({
      where: { organizationId },
      select: { id: true, code: true, name: true, codigosAnteriores: true, aliasCampanas: true },
    }),
    db.campaign.findMany({
      where: { adAccount: { organizationId } },
      select: { name: true, productId: true, productManual: true },
    }),
  ]);
  const nombreDe = new Map(productos.map((p) => [p.id, p.name]));
  const conAlias = productos.map((p) =>
    p.id === productId
      ? { ...p, aliasCampanas: [...p.aliasCampanas.filter((a) => a !== alias), alias] }
      : { ...p, aliasCampanas: p.aliasCampanas.filter((a) => a !== alias) },
  );
  const cambian: { nombre: string; antes: string }[] = [];
  let yaEstaban = 0;
  for (const c of campanas) {
    if (c.productManual) continue;
    const nuevo = matchProduct(c.name, conAlias);
    if (nuevo === productId && c.productId !== productId) cambian.push({ nombre: c.name, antes: c.productId ? nombreDe.get(c.productId) ?? "otro" : "sin producto" });
    else if (nuevo === productId) yaEstaban++;
  }
  const otroDueno = productos.find((p) => p.id !== productId && p.aliasCampanas.includes(alias)) ?? null;
  return { cambian, yaEstaban, otroDueno };
}

async function unirNombre(ctx: ContextoEnlace, entrada: Record<string, unknown>) {
  if (!ctx.puedeEnlazar) {
    return { aplicado: false, error: "Unir nombres es de dirección con acceso a las cifras. Esta persona no puede hacerlo desde el chat." };
  }
  const { organizationId } = ctx;
  const tipo = entrada.tipo === "campana" ? "campana" : entrada.tipo === "shopify" ? "shopify" : null;
  const nombre = String(entrada.nombre ?? "").replace(/\s+/g, " ").trim();
  if (!tipo || !nombre) return { aplicado: false, error: "Falta el tipo o el nombre." };

  // Segundo paso: aplicar lo que ya se confirmó.
  if (typeof entrada.codigo === "string" && entrada.codigo.trim()) {
    const c = confirmarCambio({ codigo: entrada.codigo, organizationId, userId: ctx.userId, turno: ctx.turno });
    if (!c.ok) return { aplicado: false, error: c.motivo };
    return aplicar(organizationId, c.cambio);
  }

  const productos = await buscarProductos(organizationId, String(entrada.producto ?? ""));
  if (productos.length !== 1) {
    return {
      aplicado: false,
      error: productos.length === 0 ? "No encontré ese producto." : "Hay varios productos parecidos: pregunta cuál.",
      candidatos: productos.map((p) => ({ codigo: p.code, nombre: p.name })),
    };
  }
  const destino = productos[0];

  if (tipo === "shopify") {
    const norm = normalizarNombre(nombre);
    const nombres = await nombresDePedidos(organizationId);
    const exacto = nombres.get(norm);
    if (!exacto) {
      const parecidos = [...nombres.values()]
        .map((n) => ({ ...n, base: comparar(nombre, n.nombre).base }))
        .filter((n) => n.base >= 0.5)
        .sort((a, b) => b.base - a.base || b.pedidosShopify + b.pedidosPlanilla - (a.pedidosShopify + a.pedidosPlanilla))
        .slice(0, 8)
        .map((n) => ({ nombre: n.nombre, pedidosShopify: n.pedidosShopify, pedidosPlanilla: n.pedidosPlanilla }));
      return {
        aplicado: false,
        error: "Ese nombre no aparece en los pedidos de Shopify ni en la planilla de los últimos 120 días. Puede ser un alias de campaña (tipo=campana) o estar escrito distinto.",
        nombresParecidos: parecidos,
      };
    }
    const [actual, excluido] = await Promise.all([
      db.productoShopify.findUnique({
        where: { organizationId_nombreNorm: { organizationId, nombreNorm: norm } },
        select: { product: { select: { id: true, name: true } } },
      }),
      db.nombreShopifyExcluido.findUnique({
        where: { organizationId_nombreNorm: { organizationId, nombreNorm: norm } },
        select: { motivo: true },
      }),
    ]);
    if (actual?.product.id === destino.id) return { aplicado: false, yaEstaba: true, nota: `«${exacto.nombre}» ya está unido a ${destino.name}.` };
    const codigo = proponerCambio({ organizationId, userId: ctx.userId, turno: ctx.turno, cambio: { tipo: "shopify", nombre: exacto.nombre, productId: destino.id } });
    return {
      aplicado: false,
      pendienteDeConfirmar: true,
      codigo,
      cambio: `Los pedidos con el nombre «${exacto.nombre}» pasan a contar en ${destino.name} (${destino.code}).`,
      pedidosUltimos120Dias: { shopify: exacto.pedidosShopify, planilla: exacto.pedidosPlanilla },
      hoyEstaEn: actual ? actual.product.name : excluido ? `marcado como «${excluido.motivo}» (se quita esa marca)` : "sin producto",
      instruccion: "Dile esto a la persona en una o dos frases y pregúntale si lo confirma. NO vuelvas a llamar con el código hasta que responda que sí.",
    };
  }

  const alias = limpiarAlias(nombre);
  if (!alias) return { aplicado: false, error: "El otro nombre debe tener entre 3 y 60 letras." };
  if (destino.aliasCampanas.includes(alias)) {
    return { aplicado: false, yaEstaba: true, nota: `${destino.name} ya tiene «${alias}» como otro nombre.` };
  }
  if (destino.aliasCampanas.length >= 15) return { aplicado: false, error: `${destino.name} ya tiene 15 otros nombres, el máximo.` };
  const sim = await simularAlias(organizationId, alias, destino.id);
  const codigo = proponerCambio({ organizationId, userId: ctx.userId, turno: ctx.turno, cambio: { tipo: "campana", alias, productId: destino.id } });
  return {
    aplicado: false,
    pendienteDeConfirmar: true,
    codigo,
    cambio: `«${alias}» se agrega a «Otros nombres en las campañas» de ${destino.name} (${destino.code}). Toda campaña sin código que lo contenga cae en ${destino.name}.`,
    campanasQuePasan: sim.cambian.length,
    ejemplos: sim.cambian.slice(0, 8),
    quitaDe: sim.otroDueno ? `Se le quita ese nombre a ${sim.otroDueno.name}.` : null,
    aviso:
      sim.cambian.length === 0
        ? "Hoy ninguna campaña cambia con ese nombre: solo aplicará a campañas nuevas. Revisa que esté bien escrito."
        : sim.cambian.some((c) => c.antes !== "sin producto")
          ? "Ojo: algunas campañas ya estaban en otro producto y se mueven."
          : null,
    instruccion: "Dile esto a la persona en una o dos frases y pregúntale si lo confirma. NO vuelvas a llamar con el código hasta que responda que sí.",
  };
}

async function aplicar(organizationId: string, cambio: CambioPropuesto) {
  const destino = await db.product.findFirst({ where: { id: cambio.productId, organizationId }, select: { id: true, name: true, aliasCampanas: true } });
  if (!destino) return { aplicado: false, error: "El producto ya no existe." };

  if (cambio.tipo === "shopify") {
    const nombreNorm = normalizarNombre(cambio.nombre);
    await db.productoShopify.upsert({
      where: { organizationId_nombreNorm: { organizationId, nombreNorm } },
      create: { organizationId, productId: destino.id, nombre: cambio.nombre, nombreNorm, automatico: false },
      update: { productId: destino.id, nombre: cambio.nombre, automatico: false },
    });
    await db.nombreShopifyExcluido.deleteMany({ where: { organizationId, nombreNorm } });
    programarRecalculo(organizationId);
    return {
      aplicado: true,
      hecho: `«${cambio.nombre}» quedó unido a ${destino.name}. Las pantallas se actualizan en un par de minutos.`,
    };
  }

  const otros = await db.product.findMany({
    where: { organizationId, id: { not: destino.id }, aliasCampanas: { has: cambio.alias } },
    select: { id: true, aliasCampanas: true },
  });
  for (const o of otros) {
    await db.product.update({ where: { id: o.id }, data: { aliasCampanas: o.aliasCampanas.filter((a) => a !== cambio.alias) } });
  }
  await db.product.update({
    where: { id: destino.id },
    data: { aliasCampanas: [...destino.aliasCampanas.filter((a) => a !== cambio.alias), cambio.alias].slice(0, 15) },
  });
  const { linked } = await relinkCampaignsToProducts(organizationId);
  programarRecalculo(organizationId);
  return {
    aplicado: true,
    hecho: `«${cambio.alias}» quedó en «Otros nombres en las campañas» de ${destino.name}. ${linked} campañas se reasignaron.`,
  };
}

export async function correrHerramientaDeEnlace(ctx: ContextoEnlace, nombre: string, entrada: Record<string, unknown>) {
  switch (nombre) {
    case "revisar_producto":
      return JSON.stringify(await revisarProducto(ctx, entrada));
    case "pendientes_de_unir":
      return JSON.stringify(await pendientesDeUnir(ctx, entrada));
    case "unir_nombre":
      return JSON.stringify(await unirNombre(ctx, entrada));
    default:
      return JSON.stringify({ error: "No existe la herramienta " + nombre + "." });
  }
}
