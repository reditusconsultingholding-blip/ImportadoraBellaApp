/**
 * Deja en cada ficha el CPA objetivo que muestra la Calculadora (histórico).
 * Emilia, 23-nov: «lo que es objetivo, ¿de dónde sale? De calculadora, ¿no?».
 * Gotas de drenaje mostraba $2,67, un valor provisional puesto al crear la
 * ficha desde las campañas; la Calculadora dice $7,11.
 *
 *   node --env-file=.env --import tsx scripts/objetivo-desde-calculadora-23nov.ts [--si]
 */
import { db } from "../src/lib/db";
import { separarClave } from "../src/lib/clave-calculadora";
import { normalizar } from "../src/lib/product-code";
import { objetivoDeAjuste } from "../src/lib/economia-calculadora";

const ORG = "org_importadora_bella";
const SI = process.argv.includes("--si");

async function main() {
  const [ajustes, productos] = await Promise.all([
    db.calcSetting.findMany({ where: { organizationId: ORG }, select: { producto: true, data: true } }),
    db.product.findMany({
      where: { organizationId: ORG },
      select: { id: true, name: true, cpaTarget: true, economiaDe: true },
    }),
  ]);
  const porNombre = new Map(productos.map((p) => [normalizar(p.name), p]));
  let cambian = 0;
  const conCalculadora = new Set<string>();
  for (const a of ajustes) {
    const clave = separarClave(a.producto);
    if (clave.mes) continue;
    const p = porNombre.get(normalizar(clave.producto));
    if (!p) continue;
    let d: Record<string, unknown>;
    try {
      d = JSON.parse(a.data);
    } catch {
      continue;
    }
    const objetivo = objetivoDeAjuste(d);
    if (objetivo == null) continue;
    conCalculadora.add(p.id);
    const nuevo = Math.max(0.01, objetivo);
    if (Math.abs(nuevo - p.cpaTarget) < 0.005 && p.economiaDe === "Calculadora de precios") continue;
    cambian++;
    console.log(`${p.name.padEnd(48)} ${p.cpaTarget.toFixed(2).padStart(7)} -> ${nuevo.toFixed(2).padStart(7)}   (antes: ${p.economiaDe ?? "provisional"})`);
    if (SI) await db.product.update({ where: { id: p.id }, data: { cpaTarget: nuevo, economiaDe: "Calculadora de precios" } });
  }
  const provisionales = productos.filter((p) => !p.economiaDe && !conCalculadora.has(p.id) && p.cpaTarget > 0).length;
  console.log(`\n${cambian} fichas cambian. ${provisionales} quedan con objetivo provisional (no se muestra).`);
  console.log(SI ? "HECHO" : "SOLO MUESTRA (correr con --si para hacerlo)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
