/**
 * Otros nombres de los testeos de noviembre en sus campañas sin código
 * (Emilia, 23-nov). Muestra qué campañas cambiarían de producto y, con --si,
 * guarda los alias y las reasigna.
 *
 *   node --env-file=.env --import tsx scripts/alias-campanas-23nov.ts [--si]
 */
import { db } from "../src/lib/db";
import { matchProduct, relinkCampaignsToProducts } from "../src/lib/integrations/windsor-sync";

const ORG = "org_importadora_bella";
const SI = process.argv.includes("--si");

const ALIAS: Record<string, string[]> = {
  "211748": ["VITAL DROP", "VITALDROP"],
  // Emilia, 23-nov: «Tremella y cápsula hongos es lo mismo».
  "TEST-HONGOS": ["TREMELLA", "TERMELLA", "HONGOS DE NIEVE"],
  "TEST-PIL": ["KIT PILATES", "KIT DE BARRA DE PILATES", "KIT DE BARRAS"],
  "TEST-PIXIU": ["PULSERA PIXIU"],
};

async function main() {
  const productos = await db.product.findMany({
    where: { organizationId: ORG },
    select: { id: true, code: true, name: true, codigosAnteriores: true, aliasCampanas: true },
  });
  const conAlias = productos.map((p) => (ALIAS[p.code] ? { ...p, aliasCampanas: ALIAS[p.code] } : p));
  const nombreDe = new Map(productos.map((p) => [p.id, p.name]));
  for (const code of Object.keys(ALIAS)) if (!productos.some((p) => p.code === code)) console.log(`!! falta ${code}`);

  const campanas = await db.campaign.findMany({
    where: { adAccount: { organizationId: ORG }, productManual: false },
    select: { name: true, productId: true },
  });
  for (const c of campanas) {
    const nuevo = matchProduct(c.name, conAlias);
    if (nuevo && nuevo !== c.productId) {
      console.log(`${c.name}  :  ${c.productId ? nombreDe.get(c.productId) : "(sin producto)"}  →  ${nombreDe.get(nuevo)}`);
    }
  }

  if (SI) {
    for (const [code, alias] of Object.entries(ALIAS)) {
      await db.product.updateMany({ where: { organizationId: ORG, code }, data: { aliasCampanas: alias } });
    }
    console.log(await relinkCampaignsToProducts(ORG));
  }
  console.log(`\n${SI ? "HECHO" : "SOLO MUESTRA (correr con --si para hacerlo)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
