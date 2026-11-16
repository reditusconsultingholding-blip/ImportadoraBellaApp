/**
 * Deja «Riesgo por producto» igual al archivo de Emilia (16-nov).
 *
 *   node --env-file=.env --import tsx scripts/ordenar-testeos-16nov.ts        (solo muestra)
 *   node --env-file=.env --import tsx scripts/ordenar-testeos-16nov.ts --si   (lo hace)
 *
 * QUÉ HACE, Y DE DÓNDE SALE CADA DECISIÓN
 *
 * 1. Crea la ficha de los productos en prueba que no tenían ninguna. Sus
 *    campañas no llevan código en el nombre («VEV · EC · TEST L01 · CBO»,
 *    «POWER BANK 3 EN 1/ CBO/ TEST»), así que Jarvis no podía crearlas solo y
 *    su gasto quedaba en «sin producto». La lista de testeos es la del archivo
 *    de Emilia, más Neurobion y Ojara, que se lanzaron el 11-nov con «TESTEO»
 *    en el nombre de la campaña. Cutting Mix no es testeo para ella (está en
 *    riesgo medio) y entra sin la etiqueta.
 * 2. Asigna a mano esas campañas a su ficha (como «Sin nomenclatura»:
 *    productManual, que la sincronización respeta).
 * 3. Enlaza los nombres de la planilla y de Shopify que eran el mismo
 *    producto con otro nombre: MAYAVERRA es el drenaje, la Arbutin con su
 *    «Product Id: 155171», el Kit Celimax con el 137100, la mascarilla PDRN
 *    con la ficha que tiene la pauta, Jecanori con la pulsera de cobre (misma
 *    campaña, como lo agrupa Emilia).
 *
 * No borra nada, no pisa enlaces existentes y se puede correr dos veces: lo
 * que ya está hecho se salta.
 */
import { db } from "../src/lib/db";
import { normalizarNombre } from "../src/lib/enlace-shopify";

const ORG = "org_importadora_bella";
const SI = process.argv.includes("--si");

type Nuevo = {
  code: string;
  name: string;
  testeo: boolean;
  /** Campañas sin producto cuyo nombre coincide. */
  campanas?: RegExp;
  /** Nombres de la planilla o de Shopify que son este producto. */
  nombres: string[];
};

const NUEVOS: Nuevo[] = [
  {
    code: "TEST-VEV",
    name: "VEV DeepCalm Magnesio",
    testeo: true,
    campanas: /\bVEV\b/i,
    nombres: [
      "VEV DeepCalm Magnesio Complex",
      "VEV DeepCalm Magnesio Complex 14 en 1 con Ashwagandha, L-Teanina, Zinc y Vitamina D3 · 90 gomitas sabor frutos rojos",
    ],
  },
  {
    code: "TEST-YESNAP",
    name: "Yesnap Creatina para Mujer",
    testeo: true,
    campanas: /YES+NAP/i,
    nombres: [
      "Yesnap Creatina para Mujer con Colágeno",
      "Yesnap Creatina para Mujer con Colágeno, BCAA y Vitamina D3 · 30 sobres sabor durazno (Peach Pout)",
    ],
  },
  {
    code: "TEST-MEDICUBE-NAD",
    name: "medicube EGF NAD Multi Balm",
    testeo: true,
    campanas: /MEDICUBE NAD|NAD STICK/i,
    nombres: [
      "medicube EGF NAD Firming Multi Balm",
      "medicube EGF NAD Firming Multi Balm · Bálsamo reafirmante en barra con NAD+, EGF, retinal y 5 % de Volufiline · 10 g",
    ],
  },
  {
    code: "TEST-POWERBANK-10000",
    name: "Power Bank 10000",
    testeo: true,
    campanas: /POWER BANK 10000/i,
    nombres: [],
  },
  {
    code: "TEST-POWERBANK-3EN1",
    name: "Power Bank 3 en 1 (Cargador Portátil 3 en 1)",
    testeo: true,
    campanas: /POWER BANK 3 EN 1/i,
    nombres: [
      "Cargador Portátil 3",
      "Cargador Portátil 3 en 1 RORRY 10000 mAh 22.5W con Cables Integrados y Carga para Apple Watch",
    ],
  },
  {
    code: "TEST-PIXIU",
    name: "Pulsera Pixiu Lu Lu Tong",
    testeo: true,
    campanas: /PIXIU/i,
    nombres: ["Pulsera de Cadena Retro Pixiu Lu Lu Tong"],
  },
  {
    code: "TEST-FWEE",
    name: "Spray facial antibrillo Fwee Mist",
    testeo: true,
    campanas: /FWEE/i,
    nombres: ["SPRAY FACIAL ANTIBRILLO FWEE MIST"],
  },
  {
    code: "TEST-URIC",
    name: "EU Natural Uric Acid Purge",
    testeo: true,
    campanas: /URIC/i,
    nombres: [
      "EU Natural Uric Acid Purge",
      "EU Natural Uric Acid Purge · Semilla de apio, cereza ácida Montmorency y chanca piedra · 60 cápsulas vegetales",
    ],
  },
  {
    code: "TEST-FUNDAS",
    name: "Fundas de almacenamiento al vacío",
    testeo: true,
    campanas: /FUNDAS/i,
    nombres: ["FUNDAS DE ALMACENAMIENTO AL VACIO"],
  },
  {
    code: "TEST-BAIA",
    name: "Baïa Microbiotic Creamer",
    testeo: true,
    campanas: /BA[IÏ]A /i,
    nombres: [
      "Baïa Microbiotic Creamer",
      "Baïa Microbiotic Creamer · Creamer en polvo para café sin azúcar añadido, con fibra prebiótica, probiótico LactoSpore® y melena de león · 300 g (30 dosis)",
    ],
  },
  {
    code: "TEST-NEUROBION",
    name: "Neurobion B12",
    testeo: true,
    campanas: /NEUROBION/i,
    nombres: ["Neurobion B12", "Neurobion B12 Extra Forte 10,000 mcg"],
  },
  {
    code: "TEST-OJARA",
    name: "Ojara Lacto-PDRN crema de ojos",
    testeo: true,
    campanas: /OJARA/i,
    nombres: ["Ojara Lacto-PDRN", "Ojara Lacto-PDRN 4% + B9 Crema para Ojos"],
  },
  {
    // Emilia: «Agrupados: Cutting Mix (Suplemento + LeeFar)» y «Gotas Berberina
    // va aparte de Cutting Mix». El 191586 es su «Product Id» en Shopify.
    code: "191586",
    name: "CUTTING MIX",
    testeo: false,
    // Las que empiezan con 177178/ llevan el código del drenaje adelante y ya
    // están en el drenaje: no se tocan.
    campanas: /^(?!177178\/).*(CUTTING MIX)/i,
    nombres: [
      "SUPLEMENTO CUTTING MIX DE BERBERINA",
      "SUPLEMENTO CUTTING MIX DE BERBERINA - Product Id: 191586",
      "LeeFar Cutting Mix – Bebida en polvo sabor fresa y açaí con berberina, yerba mate y fibra prebiótica – 30 sticks - Product Id: 191586",
      "LeeFar Cutting Mix – Bebida en polvo sabor fresa y açaí con berberina, yerba mate y fibra prebiótica – 30 sticks",
    ],
  },
];

/** Nombres que ya tienen ficha: código del producto existente → nombres. */
const A_EXISTENTES: Record<string, string[]> = {
  "177178": [
    "MAYAVERRA Gotas de Drenaje Linfático - Product Id: 193514",
    "1 Frasco de MAYAVERRA Gotas de Drenaje Linfático",
    "UPSELL Maya Verra Gotas de Drenaje",
  ],
  "155171": [
    "Crema Arbutin 7% + Ácido Tranexámico 4% · TOSOWOONG - Product Id: 155171",
    "Crema Arbutin 7% + Ácido Tranexámico 4% · TOSOWOONG",
  ],
  "58728": ["Mini UPS para Router 10400mAh ONE®"],
  "137100": [
    "Kit Celimax Retinal Shot + Pore & Dark Spot - Product Id: 137100",
    "Kit Celimax Retinal Shot + Pore & Dark Spot",
  ],
  "133834": ["Centellian24 Madeca Cream Time Reverse 50 ml"],
  "133915": ["MEDICUBE MASCARILLA PDRN", "Mascarillas Medicube PDRN Pink Vita Coating · Caja x10"],
  "149573": ["Jecanori - Pulsera MUJER", "Jecanori - Pulsera HOMBRE"],
  "121996": ["Dr. Melaxin Exfoliante de Arroz"],
};

async function main() {
  const [productos, enlaces, sinProducto] = await Promise.all([
    db.product.findMany({ where: { organizationId: ORG }, select: { id: true, code: true, name: true, etiquetas: true } }),
    db.productoShopify.findMany({ where: { organizationId: ORG }, select: { nombreNorm: true, productId: true } }),
    db.campaign.findMany({
      where: { adAccount: { organizationId: ORG }, productId: null },
      select: { id: true, name: true },
    }),
  ]);
  const porCodigo = new Map(productos.map((p) => [p.code, p]));
  const enlazado = new Map(enlaces.map((e) => [e.nombreNorm, e.productId]));
  const resumen = { fichas: 0, etiquetas: 0, campanas: 0, enlaces: 0, saltados: 0 };

  const enlazar = async (nombre: string, productId: string, destino: string) => {
    const norm = normalizarNombre(nombre);
    const ya = enlazado.get(norm);
    if (ya) {
      if (ya !== productId) console.log(`  ! ya enlazado a otro producto, no se toca: ${nombre}`);
      resumen.saltados += 1;
      return;
    }
    console.log(`  enlace  ${nombre}  →  ${destino}`);
    resumen.enlaces += 1;
    if (SI) {
      await db.productoShopify.create({
        data: { organizationId: ORG, productId, nombre, nombreNorm: norm, automatico: false },
      });
      enlazado.set(norm, productId);
    }
  };

  for (const n of NUEVOS) {
    let p = porCodigo.get(n.code);
    if (!p) {
      console.log(`ficha nueva  ${n.code}  ${n.name}${n.testeo ? "  [Testeo]" : ""}`);
      resumen.fichas += 1;
      if (SI) {
        p = await db.product.create({
          data: {
            organizationId: ORG,
            code: n.code,
            name: n.name,
            cpaTarget: 10,
            etiquetas: n.testeo ? ["TESTEO"] : [],
            notes:
              "Creado el 16-nov para que «Riesgo por producto» quede igual al archivo de Emilia. Sus campañas no llevan código, así que se asignaron a mano. El CPA objetivo es provisional: revísalo en la Calculadora.",
          },
          select: { id: true, code: true, name: true, etiquetas: true },
        });
      }
    } else if (n.testeo && !p.etiquetas.includes("TESTEO")) {
      console.log(`etiqueta Testeo  ${p.name}`);
      resumen.etiquetas += 1;
      if (SI) await db.product.update({ where: { id: p.id }, data: { etiquetas: [...p.etiquetas, "TESTEO"] } });
    } else {
      console.log(`= ficha ya existe  ${p.name}`);
    }
    const id = p?.id ?? "(nueva)";

    if (n.campanas) {
      for (const c of sinProducto.filter((c) => n.campanas!.test(c.name))) {
        console.log(`  campaña  ${c.name}  →  ${n.name}`);
        resumen.campanas += 1;
        if (SI) await db.campaign.update({ where: { id: c.id }, data: { productId: id, productManual: true } });
      }
    }
    for (const nombre of n.nombres) await enlazar(nombre, id, n.name);
  }

  for (const [code, nombres] of Object.entries(A_EXISTENTES)) {
    const p = porCodigo.get(code);
    if (!p) {
      console.log(`! no existe el producto ${code}, se salta`);
      continue;
    }
    console.log(`existente  ${code}  ${p.name}`);
    for (const nombre of nombres) await enlazar(nombre, p.id, p.name);
  }

  console.log(
    `\n${SI ? "HECHO" : "SOLO MUESTRA (correr con --si para hacerlo)"}: ${resumen.fichas} fichas nuevas, ${resumen.etiquetas} etiquetas, ${resumen.campanas} campañas asignadas, ${resumen.enlaces} nombres enlazados, ${resumen.saltados} ya estaban.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
