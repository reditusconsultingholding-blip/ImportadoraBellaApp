/**
 * Septiembre y octubre igual al tablero de Emilia («Comercial vs Pauta»,
 * revisado el 20-nov), como ya se hizo con noviembre el 18-nov.
 *
 *   node --env-file=.env --import tsx scripts/cuadrar-sep-oct-20nov.ts        (solo muestra)
 *   node --env-file=.env --import tsx scripts/cuadrar-sep-oct-20nov.ts --si   (lo hace)
 *
 * QUÉ ENCONTRAMOS
 *
 * $5.088 de gasto de septiembre y octubre estaba en campañas sin producto, y
 * algunos nombres de la planilla no tenían ficha o estaban en la equivocada:
 *
 * 1. Testeos de septiembre y octubre (los 22 y 11 del tablero) sin ficha:
 *    pruebas chicas cuyas campañas no llevan código. Se crean con su mes de
 *    prueba (Product.testeoMeses) y se les asignan campañas y nombres.
 * 2. Campañas sueltas de productos que sí tienen ficha: Pulsera de cobre en
 *    TikTok ($333 en octubre), Gotas Berberina «BERBETIN» ($733 en
 *    septiembre), Mini UPS ($300 en octubre), Valdora Grill, Almohada.
 * 3. «SUNGBOON EDITOR Glow PDRN Ampolla» (Shopify 192024) estaba enlazado a
 *    Deep Collagen Pink, que es otro producto: pasa a su propia ficha con sus
 *    campañas «SUNGBOON PDRN».
 * 4. «BODY CIERRE VIRAL» es el testeo de septiembre, no el Body compresor:
 *    sus 7 pedidos dejan de sumarle al Body (que pasa de 65 % a 64,5 %).
 * 5. Nombres sin enlazar: Almohada Vitalrest, Pack antiácaros, Gotero melena
 *    de león, Mini UPS NEP®.
 *
 * No borra nada y se puede correr dos veces: lo que ya está hecho se salta.
 */
import { db } from "../src/lib/db";
import { normalizarNombre } from "../src/lib/enlace-shopify";

const ORG = "org_importadora_bella";
const SI = process.argv.includes("--si");

type Ficha = {
  code: string;
  name: string;
  /** Campañas SIN producto que son de esta ficha. */
  campanas?: RegExp;
  /** Nombres de la planilla / Shopify. Si están en otra ficha, se mueven. */
  nombres?: string[];
  /** Meses en prueba. Sin esto, la ficha no es testeo. */
  meses?: string[];
};

const FICHAS: Ficha[] = [
  // Testeos de septiembre.
  { code: "TEST-LUCES-CONSTELACION", name: "Cadena de luces constelación LED", campanas: /LUCES LED DE (ALAMBRE|NAVIDAD)/i, nombres: ["Cadena de Luces Constelación LED"], meses: ["2026-09"] },
  { code: "TEST-CAYENA", name: "Suplemento de pimienta de cayena (Vivonu)", campanas: /CAYENA/i, nombres: ["SUPLEMENTO DE PIMIENTA CAYENA VIVONU"], meses: ["2026-09"] },
  { code: "TEST-PERFUME-COMESTIBLE", name: "Perfume comestible Sweet Spot", campanas: /PERFUME COMESTIBLE/i, nombres: ["PERFUME COMESTIBLE SWEET SPOT"], meses: ["2026-09"] },
  { code: "TEST-ONESIZE", name: "Spray antibrillo One Size", campanas: /OIL SUCKER/i, nombres: ["SPRAY ANTIBRILLO ONE SIZE"], meses: ["2026-09"] },
  { code: "TEST-APLIQUE-LED", name: "Aplique LED para pared", campanas: /LAMPARAS? (LED )?DE PARED/i, nombres: ["Aplique led para pared"], meses: ["2026-09"] },
  { code: "TEST-HISMILE", name: "Enjuague bucal HiSmile ID", campanas: /HISMILE/i, nombres: ["ENJUAGE BUCAL HISMILE ID"], meses: ["2026-09"] },
  { code: "TEST-CINTA-VTAPE", name: "Pack cinta doble faz Valdora Tape", campanas: /CINTA DOBLE FAZ/i, nombres: ["PACK CINTA DOBLE FAZ VALDORA TAPE"], meses: ["2026-09"] },
  { code: "TEST-NUMBUZIN", name: "Numbuzin 9 NAD+", campanas: /NUMBUZIN/i, nombres: ["NUMBUZIN 9 NAD"], meses: ["2026-09"] },
  { code: "TEST-MICROSCOPIO", name: "Microscopio electrónico para niños", campanas: /MICROSCOPIO/i, nombres: ["MICROSCOPIO ELECTRONICO PARA NIÑOS"], meses: ["2026-09"] },
  { code: "TEST-BUGBITE", name: "Herramienta contra picaduras (Bug Bite)", campanas: /BUG BITE/i, nombres: ["HERRAMIENTA CONTRA LOS PICADOS BUG BITE"], meses: ["2026-09"] },
  { code: "TEST-SEMILLA-NEGRA", name: "Cápsulas de semilla negra", campanas: /BLACK SEED|SEMILLA NEGRA/i, nombres: ["CAPSULAS DE ACEITE DE SEMILLA NEGRA"], meses: ["2026-09", "2026-10"] },
  { code: "TEST-CERVITOL", name: "Colágeno Cervitol", campanas: /CERVITOL/i, nombres: ["COLAGENO CERVITOL"], meses: ["2026-09"] },
  { code: "TEST-STRICTLY", name: "Strictly Curls Health (gel)", campanas: /STRICTLY CURLS/i, nombres: ["STRICTLY CURLS GEL"], meses: ["2026-09"] },
  { code: "TEST-MOCKTALE", name: "Suplemento Mocktale-1", campanas: /MOCKTALE/i, nombres: ["SUPLEMENTO MOCKTALE-1"], meses: ["2026-09", "2026-10"] },
  { code: "TEST-PEZ-HIERRO", name: "Pez de hierro", campanas: /PEZ DE HIERRO/i, nombres: ["PEZ DE HIERRO"], meses: ["2026-09"] },
  { code: "TEST-PEACH", name: "Peach Slices roll-on", campanas: /PEACH SLICES/i, nombres: ["PEACH SLICES ROLL ON"], meses: ["2026-09"] },
  { code: "TEST-MICROCLEAN", name: "Pack paño Microclean", campanas: /PA[ÑN]O DE MICROFIBRA/i, nombres: ["PACK PAÑO MICROCLEAN"], meses: ["2026-09"] },
  { code: "TEST-ARROZ-ROMERO", name: "Spray de agua de arroz y romero", campanas: /ARROZ Y ROMERO|ROMERO Y ARROZ/i, nombres: ["SPRAY DE AGUA DE ARROZ Y ROMERO"], meses: ["2026-09"] },
  // Sin pauta propia: su gasto quedó en Body y Faja, como en el tablero.
  { code: "TEST-BODY-CIERRE", name: "Body cierre viral", nombres: ["BODY CIERRE VIRAL"], meses: ["2026-09"] },
  { code: "TEST-PDRN-BARRA", name: "Medicube PDRN barra múltiple de colágeno", nombres: ["Medicube PDRN-Barra múltiple de colágeno"], meses: ["2026-09"] },
  { code: "TEST-CREP", name: "Spray crep para zapatos", nombres: ["SPRAY CREP ZAPATOS"], meses: ["2026-09"] },
  { code: "191586", name: "CUTTING MIX", meses: ["2026-09"] },

  // Testeos de octubre.
  { code: "TEST-CHEMICAL", name: "Limpiador de vidrio Chemical Guys", campanas: /CHEMICAL GUYS/i, nombres: ["LIMPIADOR DE VIDRIO CHEMICAL GUYS"], meses: ["2026-10"] },
  { code: "TEST-KIT-VIAJE", name: "Kit de viaje para dormir", campanas: /KIT DE VIAJE/i, nombres: ["KIT DE VIAJE PARA DORMIR"], meses: ["2026-10"] },
  { code: "TEST-APLIQUE-2", name: "Aplique tipo lámpara modelo 2", campanas: /APLIQUE DE PARED TIPO LAMPARA|APLIQUE DE LAMPARA NUEVO MODELO/i, nombres: ["APLIQUE TIPO LAMPARA MODELO#2"], meses: ["2026-10"] },
  { code: "TEST-KORMESIC", name: "Combo Kormesic 5%", campanas: /KETOKONAZOL KORMESIC/i, nombres: ["COMBO KORMESIC 5%"], meses: ["2026-10"] },
  { code: "TEST-CANELA", name: "Cápsulas de canela de Ceylan", campanas: /CANELA DE CE[YI]LAN/i, nombres: ["CAPSULAS DE CANELA DE CEYLAN"], meses: ["2026-10"] },
  { code: "TEST-DESODORANTE", name: "Desodorante roll-on Natura Care", campanas: /DESODORANTE NATURA/i, nombres: ["DESODORANTE ROLL ON NATURA CARE"], meses: ["2026-10"] },
  { code: "142265", name: "MINOXIDIL", meses: ["2026-10"] },
  // Probados en octubre y otra vez en noviembre (siguen con la etiqueta).
  { code: "TEST-FUNDAS", name: "Fundas de almacenamiento al vacío", meses: ["2026-10", "2026-11"] },
  { code: "TEST-FWEE", name: "Spray facial antibrillo Fwee Mist", meses: ["2026-10", "2026-11"] },

  // Productos normales.
  { code: "192024", name: "Sungboon Editor Glow PDRN ampolla", campanas: /SUNGBOON PDRN/i, nombres: ["SUNGBOON EDITOR Glow PDRN Ampolla", "SUNGBOON EDITOR Glow PDRN Ampolla - Product Id: 192024"] },
  { code: "ANTIACAROS", name: "Pack antiácaros (48 sobres)", campanas: /ANTIACAROS/i, nombres: ["Pack Antiacaros (48 Sobres)"] },
  { code: "167377", name: "Almohada Vital Rest", campanas: /ALMOHADA/i, nombres: ["ALMOHADA VITALREST"] },
  { code: "149573", name: "Pulsera de cobre", campanas: /PULSERA ?COBRE|PULSERACOBRE/i },
  { code: "187771", name: "Gotas Berberina", campanas: /BERBE[RT]IN/i },
  { code: "58728", name: "Mini Ups para router", campanas: /MINI ?UPS/i, nombres: ["Mini UPS para Router 10500mAH NEP®"] },
  { code: "181602", name: "PARRILLA VALDORA GRILL", campanas: /^\s*(Copy 1 of )?VALDORA GRILL/i },
  { code: "194602", name: "MELENA DE LEON", nombres: ["GOTERO MELENA DE LEON"] },
  // El tablero le suma a Beltrox la prueba del cinturón elástico de TikTok
  // ($26 y 2 compras en septiembre).
  // Y los 8 pedidos de «Holden Belt» de septiembre: es el mismo cinturón con
  // su nombre anterior (6 de 8 confirmados = 75 %, como el tablero).
  {
    code: "194239",
    name: "BELTROX",
    campanas: /CINTURON ELASTICO/i,
    nombres: ["Holden Belt", "Holden Belt, Negro", "Holden Belt, Marrón"],
  },
];

/** Fichas duplicadas: la vieja queda dentro de la nueva (como Snowy el 18-nov). */
const UNIR: { viejo: string; nuevo: string; motivo: string }[] = [
  {
    viejo: "155981",
    nuevo: "194239",
    motivo: "«Cinturón Lateral Beltrox» tenía los pedidos de la planilla y «BELTROX» las campañas: Beltrox salía sin pedidos.",
  },
];

async function main() {
  const [productos, enlaces, sueltas] = await Promise.all([
    db.product.findMany({ where: { organizationId: ORG }, select: { id: true, code: true, name: true, etiquetas: true, testeoMeses: true } }),
    db.productoShopify.findMany({ where: { organizationId: ORG }, select: { id: true, nombre: true, nombreNorm: true, productId: true } }),
    db.campaign.findMany({ where: { adAccount: { organizationId: ORG }, productId: null }, select: { id: true, name: true } }),
  ]);
  const porCodigo = new Map(productos.map((p) => [p.code, p]));
  const porId = new Map(productos.map((p) => [p.id, p]));
  const enlacePorNorm = new Map(enlaces.map((e) => [e.nombreNorm, e]));
  const usadas = new Set<string>();

  for (const f of FICHAS) {
    let p = porCodigo.get(f.code);
    if (!p) {
      if (!f.code.startsWith("TEST-") && !/^(192024|ANTIACAROS)$/.test(f.code)) {
        console.log(`!! falta la ficha ${f.code} ${f.name}`);
        continue;
      }
      console.log(`ficha nueva  ${f.code}  ${f.name}${f.meses ? `  [testeo ${f.meses.join(", ")}]` : ""}`);
      if (SI)
        p = await db.product.create({
          data: {
            organizationId: ORG,
            code: f.code,
            name: f.name,
            cpaTarget: 10,
            testeoMeses: f.meses ?? [],
            notes:
              "Creado el 20-nov para cuadrar septiembre y octubre con el tablero de Emilia. Sus campañas no llevan código y se asignaron a mano. El CPA objetivo es provisional: revísalo en la Calculadora.",
          },
          select: { id: true, code: true, name: true, etiquetas: true, testeoMeses: true },
        });
    } else if (f.meses && f.meses.some((m) => !p!.testeoMeses.includes(m))) {
      const meses = [...new Set([...p.testeoMeses, ...f.meses])].sort();
      console.log(`${p.name}  testeo en ${meses.join(", ")}`);
      if (SI) await db.product.update({ where: { id: p.id }, data: { testeoMeses: meses } });
    }
    const id = p?.id ?? "(nueva)";

    if (f.campanas) {
      const suyas = sueltas.filter((c) => !usadas.has(c.id) && f.campanas!.test(c.name));
      for (const c of suyas) {
        usadas.add(c.id);
        console.log(`  campaña  ${c.name}  →  ${f.name}`);
        if (SI) await db.campaign.update({ where: { id: c.id }, data: { productId: id, productManual: true } });
      }
    }
    for (const nombre of f.nombres ?? []) {
      const norm = normalizarNombre(nombre);
      const ya = enlacePorNorm.get(norm);
      if (ya && ya.productId === p?.id) continue;
      if (ya) {
        console.log(`  mueve  «${nombre}»  de ${porId.get(ya.productId)?.name}  →  ${f.name}`);
        if (SI) await db.productoShopify.update({ where: { id: ya.id }, data: { productId: id, automatico: false } });
      } else {
        console.log(`  enlace  «${nombre}»  →  ${f.name}`);
        if (SI) await db.productoShopify.create({ data: { organizationId: ORG, productId: id, nombre, nombreNorm: norm, automatico: false } });
      }
    }
  }
  // Los nombres de Shopify «X - Product Id: 190682» van con la ficha de «X»
  // (Microclean tenía 7 de sus 21 pedidos de septiembre así, sin enlazar).
  const conId = await db.$queryRaw<{ nombre: string }[]>`
    SELECT DISTINCT li."productName" AS nombre
      FROM "ShopifyOrderLineItem" li
      JOIN "ShopifyOrder" o ON o.id = li."orderId"
      JOIN "ShopifyStore" s ON s.id = o."storeId"
     WHERE s."organizationId" = ${ORG} AND li."productName" ILIKE '%Product Id:%'`;
  const enlacesAhora = await db.productoShopify.findMany({ where: { organizationId: ORG }, select: { nombreNorm: true, productId: true } });
  const fichaDe = new Map(enlacesAhora.map((e) => [e.nombreNorm, e.productId]));
  const deFichas = new Set(
    (await db.product.findMany({ where: { organizationId: ORG, code: { in: FICHAS.map((f) => f.code) } }, select: { id: true } })).map((p) => p.id),
  );
  for (const { nombre } of conId) {
    const norm = normalizarNombre(nombre);
    if (fichaDe.has(norm)) continue;
    const base = normalizarNombre(nombre.replace(/\s*-\s*Product Id:.*$/i, ""));
    const id = fichaDe.get(base);
    if (!id || !deFichas.has(id)) continue;
    console.log(`enlace  «${nombre}»  →  ${porId.get(id)?.name ?? "(ficha nueva)"}`);
    if (SI) await db.productoShopify.create({ data: { organizationId: ORG, productId: id, nombre, nombreNorm: norm, automatico: false } });
  }

  for (const u of UNIR) {
    const nuevo = porCodigo.get(u.nuevo);
    const viejo = porCodigo.get(u.viejo);
    if (!nuevo || !viejo) continue;
    const camp = await db.campaign.findMany({ where: { productId: viejo.id }, select: { id: true, name: true } });
    const nombres = await db.productoShopify.findMany({ where: { productId: viejo.id }, select: { id: true, nombre: true } });
    for (const c of camp) console.log(`unir  campaña ${c.name}  →  ${nuevo.name}`);
    for (const n of nombres) console.log(`unir  nombre «${n.nombre}»  →  ${nuevo.name}`);
    console.log(`ficha «${viejo.name}» (${viejo.code}) queda dentro de «${nuevo.name}»: ${u.motivo}`);
    if (SI) {
      const full = await db.product.findUniqueOrThrow({ where: { id: nuevo.id }, select: { codigosAnteriores: true } });
      await db.$transaction([
        db.campaign.updateMany({ where: { productId: viejo.id }, data: { productId: nuevo.id } }),
        db.productoShopify.updateMany({ where: { productId: viejo.id }, data: { productId: nuevo.id } }),
        db.product.update({
          where: { id: nuevo.id },
          data: { codigosAnteriores: [...new Set([...full.codigosAnteriores, viejo.code])] },
        }),
        db.product.update({
          where: { id: viejo.id },
          data: {
            code: `${viejo.code}-UNIDO`,
            etiquetas: [...new Set([...viejo.etiquetas, "APAGADO"])],
            notes: `Unido el 20-nov dentro de «${nuevo.name}» (${nuevo.code}). ${u.motivo}`,
          },
        }),
      ]);
    }
  }

  console.log(`\n${SI ? "HECHO" : "SOLO MUESTRA (correr con --si para hacerlo)"}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
