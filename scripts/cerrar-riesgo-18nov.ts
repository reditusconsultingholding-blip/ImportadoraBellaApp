/**
 * Segunda pasada del 18-nov: deja «Riesgo por producto» y «Testeos» producto
 * por producto igual al tablero «Comercial vs Pauta» de Emilia.
 *
 *   node --env-file=.env --import tsx scripts/cerrar-riesgo-18nov.ts        (solo muestra)
 *   node --env-file=.env --import tsx scripts/cerrar-riesgo-18nov.ts --si   (lo hace)
 *
 * QUÉ HACE
 *
 * 1. Campañas sueltas que el tablero sí asigna (el nombre no trae el código):
 *    «MDC · EC · TEST» → Medicube EGF NAD, «MICROBIOTIC CREAMER» → Baïa,
 *    «SPRAY FACIAL ANTIBRILLO» → Fwee Mist, «PULSERACOBRE / PUJA» → Pulsera de
 *    cobre. Las de búsqueda de personal, MENOMAG e «IMPO · EC · TEST» siguen
 *    sin producto, igual que en el tablero ($124 y 11 compras).
 * 2. «137162/ SHAMPOO DE BATANA+ACEITE» es el combo: pasa a Combo Batana.
 * 3. Fichas duplicadas, unidas: SNOWYBRA (160056) dentro de SNOWY y «Mini UPS
 *    para Router 10500mAH NEP®» (61161) dentro de «Mini Ups para router»
 *    (58728), que es la que tiene los pedidos. El código viejo queda como
 *    código anterior del que se queda, así las campañas nuevas caen solas ahí.
 * 4. VITALDROPS es un testeo de noviembre (lo lista el tablero).
 * 5. «Kit de Barra de Pilates con Bandas», de la planilla, es el testeo PIL.
 * 6. Neurobion B12 queda Descartado, como lo tiene Emilia (se restaura con un
 *    clic en la pestaña Testeos).
 *
 * No borra nada y se puede correr dos veces.
 */
import { db } from "../src/lib/db";
import { normalizarNombre } from "../src/lib/enlace-shopify";

const ORG = "org_importadora_bella";
const SI = process.argv.includes("--si");

const SUELTAS: [RegExp, string][] = [
  [/^MDC · EC · TEST/i, "TEST-MEDICUBE-NAD"],
  [/MICROBIOTIC CREAMER/i, "TEST-BAIA"],
  [/^SPRAY FACIAL ANTIBRILLO/i, "TEST-FWEE"],
  [/^PULSERACOBRE\s*\//i, "149573"],
  [/SHAMPOO DE BATANA\s*\+\s*ACEITE/i, "208429"],
];

const UNIR: { viejo: string; nuevo: string }[] = [
  { viejo: "160056", nuevo: "122050" }, // SNOWYBRA → SNOWY
  { viejo: "61161", nuevo: "58728" }, // Mini UPS NEP® → Mini Ups para router
];

async function main() {
  const productos = await db.product.findMany({
    where: { organizationId: ORG },
    select: { id: true, code: true, name: true, etiquetas: true, codigosAnteriores: true },
  });
  const porCodigo = new Map(productos.map((p) => [p.code, p]));
  const porNombre = (re: RegExp) => productos.find((p) => re.test(p.name));
  const ficha = (code: string) => {
    if (code === "TEST-BAIA") return porCodigo.get(code) ?? porNombre(/ba[iï]a/i);
    return porCodigo.get(code);
  };

  // 1 y 2. Campañas.
  const campanas = await db.campaign.findMany({
    where: { adAccount: { organizationId: ORG } },
    select: { id: true, name: true, productId: true },
  });
  for (const [re, code] of SUELTAS) {
    const p = ficha(code);
    if (!p) {
      console.log(`!! no encuentro la ficha ${code}`);
      continue;
    }
    for (const c of campanas.filter((c) => re.test(c.name) && c.productId !== p.id)) {
      console.log(`campaña  ${c.name}  →  ${p.name}`);
      if (SI) await db.campaign.update({ where: { id: c.id }, data: { productId: p.id, productManual: true } });
    }
  }

  // 3. Fichas duplicadas.
  for (const u of UNIR) {
    const nuevo = porCodigo.get(u.nuevo);
    const viejo = porCodigo.get(u.viejo) ?? productos.find((p) => p.code === `${u.viejo}-UNIDO`);
    if (!nuevo || !viejo) {
      console.log(`!! falta ${u.viejo} o ${u.nuevo}`);
      continue;
    }
    const camp = campanas.filter((c) => c.productId === viejo.id);
    const nombres = await db.productoShopify.findMany({ where: { productId: viejo.id }, select: { id: true, nombre: true } });
    for (const c of camp) console.log(`unir  ${c.name}  →  ${nuevo.name}`);
    for (const n of nombres) console.log(`unir  nombre «${n.nombre}»  →  ${nuevo.name}`);
    const yaUnido = viejo.code.endsWith("-UNIDO");
    if (!yaUnido) console.log(`ficha «${viejo.name}» (${viejo.code}) queda dentro de «${nuevo.name}»`);
    if (SI) {
      await db.$transaction([
        db.campaign.updateMany({ where: { productId: viejo.id }, data: { productId: nuevo.id } }),
        db.productoShopify.updateMany({ where: { productId: viejo.id }, data: { productId: nuevo.id } }),
        ...(yaUnido
          ? []
          : [
              db.product.update({
                where: { id: nuevo.id },
                data: { codigosAnteriores: [...new Set([...nuevo.codigosAnteriores, viejo.code, ...viejo.codigosAnteriores])] },
              }),
              db.product.update({
                where: { id: viejo.id },
                data: {
                  code: `${viejo.code}-UNIDO`,
                  codigosAnteriores: [],
                  etiquetas: [...new Set([...viejo.etiquetas, "APAGADO"])],
                  notes: `Unido el 18-nov dentro de «${nuevo.name}» (${nuevo.code}): era la misma ficha duplicada. Sus campañas y nombres pasaron allá.`,
                },
              }),
            ]),
      ]);
    }
  }

  // 4, 6. Etiquetas.
  const etiquetar = async (code: string, etiqueta: string) => {
    const p = porCodigo.get(code);
    if (!p) return console.log(`!! falta ${code}`);
    if (p.etiquetas.includes(etiqueta)) return;
    console.log(`${p.name}  +${etiqueta}`);
    if (SI) await db.product.update({ where: { id: p.id }, data: { etiquetas: [...p.etiquetas, etiqueta] } });
  };
  await etiquetar("211748", "TESTEO");
  await etiquetar("TEST-NEUROBION", "DESCARTADO");

  // 5. El kit de Pilates es PIL.
  const pil = porCodigo.get("TEST-PIL");
  if (pil) {
    const nombre = "Kit de Barra de Pilates con Bandas";
    const norm = normalizarNombre(nombre);
    const ya = await db.productoShopify.findFirst({ where: { organizationId: ORG, nombreNorm: norm } });
    if (!ya) {
      console.log(`enlace  ${nombre}  →  ${pil.name}`);
      if (SI) await db.productoShopify.create({ data: { organizationId: ORG, productId: pil.id, nombre, nombreNorm: norm, automatico: false } });
    }
    if (pil.name === "PIL") {
      console.log("PIL  →  «PIL (kit de barra de Pilates)»");
      if (SI) await db.product.update({ where: { id: pil.id }, data: { name: "PIL (kit de barra de Pilates)" } });
    }
  }

  console.log(`\n${SI ? "HECHO" : "SOLO MUESTRA (correr con --si para hacerlo)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
