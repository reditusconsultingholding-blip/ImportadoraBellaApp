import test from "node:test";
import assert from "node:assert/strict";
import { cuadrar, estadoDelCuadre, riesgoDe, topDelMes } from "../src/lib/shopify-vs-ads-calculo";
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

test("riesgo: buena confirmación y CPA dentro del objetivo es bajo", () => {
  const base = { pedidos: 50, cpaObjetivo: 6, utilidad: 300 };
  assert.equal(riesgoDe({ ...base, efectividad: 0.75, cpaReal: 5 }), "bajo");
  assert.equal(riesgoDe({ ...base, efectividad: 0.75, cpaReal: 7 }), "medio");
  assert.equal(riesgoDe({ ...base, efectividad: 0.5, cpaReal: 5 }), "medio");
  assert.equal(riesgoDe({ ...base, efectividad: 0.5, cpaReal: 7 }), "alto");
});

test("riesgo: perder plata sin buena confirmación es alto; sin pedidos no hay datos", () => {
  assert.equal(riesgoDe({ pedidos: 10, efectividad: 0.6, cpaReal: 4, cpaObjetivo: 6, utilidad: -20 }), "alto");
  assert.equal(riesgoDe({ pedidos: 0, efectividad: 0, cpaReal: null, cpaObjetivo: 6, utilidad: -20 }), "sinDatos");
  // Sin objetivo cargado manda la utilidad.
  assert.equal(riesgoDe({ pedidos: 10, efectividad: 0.8, cpaReal: 4, cpaObjetivo: null, utilidad: 100 }), "bajo");
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
