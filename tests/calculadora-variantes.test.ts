import test from "node:test";
import assert from "node:assert/strict";
import { agruparVariantes, claveDeVariante } from "../src/lib/calculadora-variantes";

const p = (name: string, extra: Partial<{ activo: boolean; cpa: number | null }> = {}) => ({
  name,
  activo: extra.activo,
  cpa: extra.cpa ?? null,
  efectividad: null,
  flete: null,
});

test("las ofertas de un combo comparten clave", () => {
  const k = claveDeVariante("Combo 1 Cyperus + 1 Razuradora");
  assert.equal(claveDeVariante("Combo 2 Cyperus + 1 Razuradora"), k);
  assert.equal(claveDeVariante("Combo 3 Cyperus+ 1 Razuradora"), k);
  assert.equal(claveDeVariante("Combo 2 Cyperus + 1 Razuradora - Product Id: 177185"), k);
  assert.equal(claveDeVariante("2 Shampoo + 1 Aceite de Batana"), claveDeVariante("3 Shampoo + 2 Aceite de Batana"));
});

test("productos distintos no se mezclan", () => {
  assert.notEqual(claveDeVariante("Combo 1 Cyperus + 1 Razuradora"), claveDeVariante("Combo 1 Truly + 1 Razuradora"));
  assert.notEqual(claveDeVariante("Hair Growth x 80 cápsulas"), claveDeVariante("Hair Growth x 120 cápsulas"));
  assert.notEqual(
    claveDeVariante("Shampoo aceite de Batana Original 300ml"),
    claveDeVariante("Shampoo  aceite de Batana Original 100ml"),
  );
  assert.notEqual(claveDeVariante("Afeitadora Eléctrica 2 en 1"), claveDeVariante("Cepillo Inalámbrico 9 en 1"));
});

test("queda una sola línea, la oferta más chica, con las demás anotadas", () => {
  const r = agruparVariantes([
    p("Combo 3 Cyperus+ 1 Razuradora"),
    p("Combo 1 Cyperus + 1 Razuradora"),
    p("Combo 2 Cyperus + 1 Razuradora", { activo: false }),
    p("Crema Arbutin"),
  ]);
  assert.equal(r.length, 2);
  const combo = r.find((x) => x.name.includes("Cyperus"))!;
  assert.equal(combo.name, "Combo 1 Cyperus + 1 Razuradora");
  assert.deepEqual(combo.variantes?.sort(), ["Combo 2 Cyperus + 1 Razuradora", "Combo 3 Cyperus+ 1 Razuradora"]);
});

test("gana la que tiene ficha, y el grupo queda activo si alguna se pauta", () => {
  const r = agruparVariantes([
    p("Combo 1 Cyperus + 1 Razuradora"),
    p("Combo 2 Cyperus + 1 Razuradora", { cpa: 5 }),
    p("Combo 3 Cyperus+ 1 Razuradora", { activo: true }),
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].name, "Combo 2 Cyperus + 1 Razuradora");
  assert.equal(r[0].activo, true);
});

test("la copia con «Product Id» de Dropi no se repite", () => {
  const r = agruparVariantes([p("Crema Arbutin - Product Id: 155171"), p("Crema Arbutin")]);
  assert.deepEqual(r.map((x) => x.name), ["Crema Arbutin"]);
});
