/**
 * Deja «Riesgo por producto» y «Testeos» igual al tablero de Emilia
 * («Comercial vs Pauta», revisado el 18-nov).
 *
 *   node --env-file=.env --import tsx scripts/ordenar-testeos-18nov.ts        (solo muestra)
 *   node --env-file=.env --import tsx scripts/ordenar-testeos-18nov.ts --si   (lo hace)
 *
 * QUÉ HACE
 *
 * 1. Los testeos nuevos de noviembre que no tenían ficha: Cereza ácida, TRM,
 *    PIL, Cápsula hongos de nieve y Gimnasio en barra. Se crean con la
 *    etiqueta Testeo y se les asignan sus campañas.
 * 2. Campañas de testeos que quedaron sueltas porque el nombre no coincidía
 *    con el patrón del 16-nov: «URI · EC · TEST» (Uric Acid Purge) y
 *    «BOLSAS DE ALMACENAMIENTO» (Fundas al vacío).
 * 3. Power Bank 10000 va con el Cargador portátil RORRY, como lo agrupa
 *    Emilia: sus campañas y sus nombres pasan a esa ficha y la ficha vieja
 *    pierde la etiqueta Testeo (si no, contaba un testeo de más).
 * 4. «CP2 - Top Ventas» queda marcada como cuenta que vende por WhatsApp: sus
 *    campañas «…/WP…/TODOECU» no traen compras web y le sumaban $1.560 a
 *    NIDA (CPA 13,69 en vez de 6,65). El tablero de Emilia tampoco la cuenta.
 *
 * No borra nada y se puede correr dos veces: lo que ya está hecho se salta.
 */
import { db } from "../src/lib/db";
import { normalizarNombre } from "../src/lib/enlace-shopify";

const ORG = "org_importadora_bella";
const SI = process.argv.includes("--si");

type Ficha = { code: string; name: string; campanas: RegExp; nombres: string[] };

const NUEVOS: Ficha[] = [
  {
    code: "TEST-CEREZA",
    name: "Cereza ácida extracto (cápsulas)",
    campanas: /CEREZA/i,
    nombres: ["Cereza Ácida Extracto 60 Cápsulas"],
  },
  { code: "TEST-TRM", name: "TRM", campanas: /^\s*TRM\b/i, nombres: [] },
  { code: "TEST-PIL", name: "PIL", campanas: /^\s*PIL\b/i, nombres: [] },
  {
    code: "TEST-HONGOS",
    name: "Cápsula hongos de nieve",
    // «CAFE DE HONGOS» es otro producto: solo las de hongos de nieve (tremella).
    campanas: /HONGOS DE NIEVE|TREMELLA/i,
    nombres: [],
  },
  { code: "TEST-GIMNASIO", name: "Gimnasio en barra", campanas: /GIMNASIO/i, nombres: [] },
];

/** Campañas sueltas de testeos que ya tienen ficha. */
const SUELTAS: Record<string, RegExp> = {
  "TEST-URIC": /^\s*URI\b/i,
  "TEST-FUNDAS": /BOLSAS DE ALMACENAMIENTO/i,
};

async function main() {
  const [productos, enlaces, sinProducto] = await Promise.all([
    db.product.findMany({ where: { organizationId: ORG }, select: { id: true, code: true, name: true, etiquetas: true } }),
    db.productoShopify.findMany({ where: { organizationId: ORG }, select: { id: true, nombre: true, nombreNorm: true, productId: true } }),
    db.campaign.findMany({ where: { adAccount: { organizationId: ORG }, productId: null }, select: { id: true, name: true } }),
  ]);
  const porCodigo = new Map(productos.map((p) => [p.code, p]));
  const enlazado = new Map(enlaces.map((e) => [e.nombreNorm, e.productId]));

  for (const n of NUEVOS) {
    let p = porCodigo.get(n.code);
    if (!p) {
      console.log(`ficha nueva  ${n.code}  ${n.name}  [Testeo]`);
      if (SI) {
        p = await db.product.create({
          data: {
            organizationId: ORG,
            code: n.code,
            name: n.name,
            cpaTarget: 10,
            etiquetas: ["TESTEO"],
            notes:
              "Creado el 18-nov: testeo de noviembre del tablero de Emilia. Sus campañas no llevan código y se asignaron a mano. El CPA objetivo es provisional: revísalo en la Calculadora.",
          },
          select: { id: true, code: true, name: true, etiquetas: true },
        });
      }
    } else console.log(`= ya existe  ${p.name}`);
    const id = p?.id ?? "(nueva)";
    const suyas = sinProducto.filter((c) => n.campanas.test(c.name));
    if (suyas.length === 0) console.log(`  (sin campañas que coincidan con ${n.campanas})`);
    for (const c of suyas) {
      console.log(`  campaña  ${c.name}  →  ${n.name}`);
      if (SI) await db.campaign.update({ where: { id: c.id }, data: { productId: id, productManual: true } });
    }
    for (const nombre of n.nombres) {
      const norm = normalizarNombre(nombre);
      if (enlazado.has(norm)) continue;
      console.log(`  enlace  ${nombre}  →  ${n.name}`);
      if (SI) await db.productoShopify.create({ data: { organizationId: ORG, productId: id, nombre, nombreNorm: norm, automatico: false } });
    }
  }

  for (const [code, re] of Object.entries(SUELTAS)) {
    const p = porCodigo.get(code);
    if (!p) continue;
    for (const c of sinProducto.filter((c) => re.test(c.name))) {
      console.log(`campaña suelta  ${c.name}  →  ${p.name}`);
      if (SI) await db.campaign.update({ where: { id: c.id }, data: { productId: p.id, productManual: true } });
    }
  }

  // Power Bank 10000 → Cargador portátil RORRY (Power Bank 3 en 1).
  const viejo = porCodigo.get("TEST-POWERBANK-10000");
  const rorry = porCodigo.get("TEST-POWERBANK-3EN1");
  if (viejo && rorry) {
    const camp = await db.campaign.findMany({ where: { productId: viejo.id }, select: { id: true, name: true } });
    for (const c of camp) {
      console.log(`Power Bank  ${c.name}  →  ${rorry.name}`);
      if (SI) await db.campaign.update({ where: { id: c.id }, data: { productId: rorry.id, productManual: true } });
    }
    for (const e of enlaces.filter((e) => e.productId === viejo.id)) {
      console.log(`Power Bank  nombre «${e.nombre}»  →  ${rorry.name}`);
      if (SI) await db.productoShopify.update({ where: { id: e.id }, data: { productId: rorry.id } });
    }
    if (viejo.etiquetas.includes("TESTEO")) {
      console.log(`Power Bank 10000 deja de ser testeo aparte`);
      if (SI)
        await db.product.update({
          where: { id: viejo.id },
          data: { etiquetas: viejo.etiquetas.filter((e) => e !== "TESTEO") },
        });
    }
  }

  // La cuenta de ventas por WhatsApp.
  const wa = await db.adAccount.findFirst({
    where: { organizationId: ORG, platform: "META", name: "CP2 - Top Ventas" },
    select: { id: true, ventaFueraWebAt: true },
  });
  if (wa && !wa.ventaFueraWebAt) {
    console.log("CP2 - Top Ventas  →  vende por WhatsApp (fuera de la comparación)");
    if (SI)
      await db.adAccount.update({
        where: { id: wa.id },
        data: { ventaFueraWebAt: new Date(), ventaFueraWebPor: "Ajuste 18-nov (tablero de Emilia)" },
      });
  }

  console.log(`\n${SI ? "HECHO" : "SOLO MUESTRA (correr con --si para hacerlo)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
