import test from "node:test";
import assert from "node:assert/strict";
import { clasificarRiesgo, cpaDePlanilla, cuadrar, estadoDelCuadre, riesgoDe, topDelMes } from "../src/lib/shopify-vs-ads-calculo";
import { limpiarEtiquetas } from "../src/lib/etiquetas-producto";

test("el factor es plataforma ÷ Shopify y los dos CPA salen del mismo gasto", () => {
  // El caso de NIDA en la llamada: la plataforma se atribuye de más.
  const c = cuadrar({ shopify: 100, meta: 120, tiktok: 12, gasto: 675 });
  assert.equal(c.plataforma, 132);
  assert.equal(c.diferencia, 32);
  assert.ok(Math.abs(c.factor! - 1.32) < 1e-9);
  assert.ok(Math.abs(c.porcentaje! - 0.32) < 1e-9);
  assert.ok(Math.abs(c.cpaReal! - 6.75) < 1e-9);
  assert.ok(c.cpaPlataforma! < c.cpaReal!);
  assert.equal(c.estado, "mal");
});

test("hasta un 10% de diferencia es aceptable, hasta 25% se vigila", () => {
  assert.equal(estadoDelCuadre(100, 97), "bien");
  assert.equal(estadoDelCuadre(100, 110), "bien");
  assert.equal(estadoDelCuadre(100, 120), "vigilar");
  assert.equal(estadoDelCuadre(100, 135), "mal");
});

test("compras de plataforma sin pedidos en Shopify es lo peor; sin nada no se juzga", () => {
  assert.equal(estadoDelCuadre(0, 5), "mal");
  assert.equal(estadoDelCuadre(0, 0), null);
  const c = cuadrar({ shopify: 0, meta: 0, tiktok: 0, gasto: 50 });
  assert.equal(c.factor, null);
  assert.equal(c.cpaReal, null);
  assert.equal(c.cpaPlataforma, null);
});

// Casos reales del tablero «Comercial vs Pauta» de Emilia, 1 al 17 de noviembre.
const fila = (pedidos: number, conf: number, gasto: number, plataforma: number, testeo = false) => ({
  pedidos,
  confirmados: Math.round(conf * pedidos),
  cpa: cpaDePlanilla(gasto, pedidos),
  plataforma,
  gasto,
  testeo,
});

test("riesgo: la regla del tablero de Emilia (65 % / $8 alto; 70 % / $5 / 30 pedidos / 1,33× medio)", () => {
  assert.equal(riesgoDe(fila(1961, 0.717, 10031, 2192)), "medio"); // drenaje: CPA 5,12
  assert.equal(riesgoDe(fila(58, 0.7414, 270, 65)), "bajo"); // Combo Celimax: cumple todo
  assert.equal(riesgoDe(fila(220, 0.7, 1464, 314)), "medio"); // NIDA: CPA 6,65 y 1,43×
  assert.equal(riesgoDe(fila(11, 0.6364, 6, 1)), "alto"); // Mini UPS: confirma 63,64 %
  // Los bordes exactos: 65 % no es alto, 70 % no es medio, $8 no es alto.
  assert.equal(riesgoDe(fila(100, 0.65, 400, 100)), "medio");
  assert.equal(riesgoDe(fila(100, 0.7, 500, 100)), "bajo");
  assert.equal(riesgoDe(fila(100, 0.8, 800, 100)), "medio");
});

test("riesgo alto se separa por causa", () => {
  assert.equal(clasificarRiesgo(fila(200, 0.635, 1711, 286)).causa, "ambas"); // Kit de batana
  assert.equal(clasificarRiesgo(fila(120, 0.8, 1158, 194)).causa, "cpa"); // Pulsera de cobre
  assert.equal(clasificarRiesgo(fila(11, 0.6364, 6, 1)).causa, "confirmacion"); // Mini UPS
});

test("testeos: sin regla de volumen; sin pedidos pero con pauta es alto", () => {
  assert.equal(riesgoDe(fila(22, 0.8182, 72, 24, true)), "bajo"); // Fundas al vacío
  assert.equal(riesgoDe(fila(22, 0.8182, 72, 24, false)), "medio"); // el mismo, si no fuera testeo
  const vev = clasificarRiesgo(fila(21, 0.8095, 150, 31, true)); // VEV: CPA 7,14 y 1,48×
  assert.equal(vev.riesgo, "medio");
  assert.equal(vev.motivos.length, 2);
  const trm = clasificarRiesgo({ pedidos: 0, confirmados: 0, cpa: null, plataforma: 2, gasto: 14, testeo: true });
  assert.equal(trm.riesgo, "alto");
  assert.equal(trm.causa, "sinDatos");
  assert.equal(clasificarRiesgo({ pedidos: 0, confirmados: 0, cpa: null, plataforma: 0, gasto: 0 }).riesgo, "sinDatos");
});

test("el CPA sale de la planilla y sin gasto no existe", () => {
  assert.equal(cpaDePlanilla(21616.02, 4128)?.toFixed(2), "5.24");
  assert.equal(cpaDePlanilla(0, 270), null);
  assert.equal(cpaDePlanilla(90, 0), null);
});

test("el top ordena por utilidad y deja afuera los sin pedidos", () => {
  const top = topDelMes([
    { n: "a", utilidad: 10, pedidos: 1 },
    { n: "b", utilidad: 500, pedidos: 0 },
    { n: "c", utilidad: 90, pedidos: 3 },
  ]);
  assert.deepEqual(top.map((t) => t.n), ["c", "a"]);
});

test("las etiquetas desconocidas o repetidas se descartan", () => {
  assert.deepEqual(limpiarEtiquetas(["ACTIVO", "TESTEO", "ACTIVO", "cualquiera", 3]), ["TESTEO", "ACTIVO"]);
  assert.deepEqual(limpiarEtiquetas("TESTEO"), []);
});

test("vender sin pauta no es un píxel roto: no se pinta ni tiene CPA", () => {
  const c = cuadrar({ shopify: 70, meta: 0, tiktok: 0, gasto: 0 });
  assert.equal(c.estado, null);
  assert.equal(c.cpaReal, null);
});

test("factor sobre los pedidos de Shopify y solo desde 10 (tablero de Emilia, 18-nov)", () => {
  const base = { confirmados: 0, cpa: null, gasto: 0 };
  // Té 18 flavors: 191 compras ÷ 125 de Shopify = 1,53× (sobre los 124 del comercial daría 1,54×).
  const te = clasificarRiesgo({ ...base, pedidos: 124, confirmados: 77, cpa: 5.5, plataforma: 191, gasto: 682, shopify: 125 });
  assert.ok(te.motivos.some((m) => m.texto === "plataforma cuenta 1,53× los pedidos"));
  // Pulsera de cobre: 223 ÷ 147 = 1,52× (sobre los 141 del comercial: 1,58×).
  const cobre = clasificarRiesgo({ ...base, pedidos: 141, confirmados: 111, cpa: 9.18, plataforma: 223, gasto: 1294, shopify: 147 });
  assert.ok(cobre.motivos.some((m) => m.texto.includes("1,52×")));
  // Fwee: 15 compras con 7 pedidos de Shopify no se marca (muy pocos para medir).
  const fwee = clasificarRiesgo({ ...base, pedidos: 7, confirmados: 6, cpa: 15, plataforma: 15, gasto: 105, shopify: 7, testeo: true });
  assert.deepEqual(fwee.motivos.map((m) => m.texto), ["CPA real $15,00"]);
  // Uric: 24 ÷ 16 = 1,5× sí, con 16 pedidos.
  const uric = clasificarRiesgo({ ...base, pedidos: 15, confirmados: 12, cpa: 10.13, plataforma: 24, gasto: 152, shopify: 16, testeo: true });
  assert.ok(uric.motivos.some((m) => m.texto.includes("1,5×")));
});

test("en alto se listan también los umbrales de medio que no cumple", () => {
  // Lifting Pro Duo: CPA 10,41 (alto) con 68,18 % y 22 pedidos.
  const l = clasificarRiesgo({ pedidos: 22, confirmados: 15, cpa: 10.41, plataforma: 21, gasto: 229, shopify: 23 });
  assert.equal(l.riesgo, "alto");
  assert.equal(l.causa, "cpa");
  assert.deepEqual(l.motivos.map((m) => m.texto), ["confirma 68,18 %", "CPA real $10,41", "solo 22 pedidos comercial"]);
  // Pauta sin pedidos fuera de testeo: también «solo 0 pedidos comercial».
  const s = clasificarRiesgo({ pedidos: 0, confirmados: 0, cpa: null, plataforma: 2, gasto: 64 });
  assert.deepEqual(s.motivos.map((m) => m.texto), ["sin dato comercial", "sin pedidos para medir CPA", "solo 0 pedidos comercial"]);
});

test("Descartado es una etiqueta válida", () => {
  assert.deepEqual(limpiarEtiquetas(["DESCARTADO", "TESTEO"]), ["TESTEO", "DESCARTADO"]);
});
