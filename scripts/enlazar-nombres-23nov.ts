/**
 * Los títulos nuevos de Shopify y de la planilla de noviembre que no sumaban a
 * ningún producto (Emilia, 23-nov: «no me aparece ni siquiera el dato de
 * Shopify… son testeos, son productos nuevos»). Eran 354 pedidos de noviembre.
 *
 *   node --env-file=.env --import tsx scripts/enlazar-nombres-23nov.ts        (solo muestra)
 *   node --env-file=.env --import tsx scripts/enlazar-nombres-23nov.ts --si   (lo hace)
 *
 * Primero corre el enlace automático (los «- Product Id: …»), después los que
 * hay que decidir por nombre. No borra nada y se puede correr dos veces.
 */
import { db } from "../src/lib/db";
import { normalizarNombre } from "../src/lib/enlace-shopify";
import { autoEnlazarNombres, fichaPorProductId } from "../src/lib/auto-enlace";
import { clasificarNombres } from "../src/lib/pedidos-reales";

const ORG = "org_importadora_bella";
const SI = process.argv.includes("--si");

const A_MANO: [string, string][] = [
  ["2 Shampoo + 1 Aceite de Batana", "208429"],
  ["1 Shampoo + 1 Aceite de Batana", "208429"],
  ["3 Shampoo + 2 Aceite de Batana", "208429"],
  ["Vitaldrops amua · Gotas multiherbales para tus curvas · 60 ml", "211748"],
  ["Vitaldrops Gotas Multiherbales", "211748"],
  ["Gotas de Drenaje Linfático Mayaverra · Oferta 1-3-5", "177178"],
  // Emilia, 23-nov: «Tremella y cápsula hongos es lo mismo».
  ["Tremella Hongo de la Belleza · 100 cápsulas con colágeno y vitaminas C y E", "TEST-HONGOS"],
  ["Tremella Cápsulas de Hongo de Nieve", "TEST-HONGOS"],
  ["Cutting Mix LeeFar · Bebida con berberina, cromo y yerba mate · 30 sobres", "191586"],
  ["Kit Noche Completa: Loción de Magnesio + 20 Parches", "177993"],
];

/** Lo que se vende como agregado de otra compra: no es un producto pautado. */
const UPSELLS = ["Bloqueador Solar Tocobo Stick Upsell"];

async function main() {
  if (SI) {
    const auto = await autoEnlazarNombres(ORG);
    for (const a of auto) console.log(`automático  «${a.nombre}»`);
  } else {
    const [nombres, enlaces, productos] = await Promise.all([
      clasificarNombres(ORG),
      db.productoShopify.findMany({ where: { organizationId: ORG }, select: { nombreNorm: true, productId: true } }),
      db.product.findMany({ where: { organizationId: ORG }, select: { id: true, name: true, code: true } }),
    ]);
    const porNombre = new Map(enlaces.map((e) => [e.nombreNorm, e.productId]));
    const porCodigo = new Map(productos.map((p) => [normalizarNombre(p.code), p.id]));
    const nombreDe = new Map(productos.map((p) => [p.id, p.name]));
    for (const n of nombres.filter((n) => n.clase === "sin")) {
      const id = fichaPorProductId(n.nombre, porNombre, porCodigo);
      if (id) console.log(`automático  «${n.nombre}»  →  ${nombreDe.get(id)}`);
    }
  }

  const productos = await db.product.findMany({ where: { organizationId: ORG }, select: { id: true, code: true, name: true } });
  const porCodigo = new Map(productos.map((p) => [p.code, p]));
  for (const [nombre, code] of A_MANO) {
    const p = porCodigo.get(code);
    if (!p) {
      console.log(`!! falta la ficha ${code}`);
      continue;
    }
    const nombreNorm = normalizarNombre(nombre);
    const ya = await db.productoShopify.findFirst({ where: { organizationId: ORG, nombreNorm } });
    if (ya) continue;
    console.log(`enlace  «${nombre}»  →  ${p.name}`);
    if (SI) await db.productoShopify.create({ data: { organizationId: ORG, productId: p.id, nombre, nombreNorm, automatico: false } });
  }
  for (const nombre of UPSELLS) {
    const nombreNorm = normalizarNombre(nombre);
    const ya = await db.nombreShopifyExcluido.findFirst({ where: { organizationId: ORG, nombreNorm } });
    if (ya) continue;
    console.log(`upsell  «${nombre}»`);
    if (SI) await db.nombreShopifyExcluido.create({ data: { organizationId: ORG, nombre, nombreNorm, motivo: "upsell" } });
  }
  console.log(`\n${SI ? "HECHO" : "SOLO MUESTRA (correr con --si para hacerlo)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
