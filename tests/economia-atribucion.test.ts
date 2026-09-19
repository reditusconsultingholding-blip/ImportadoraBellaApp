// Regresión de margen/CPA de equilibrio (calculadora) y del cruce de atribución.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcular } from "@/lib/economia";
import { leerCruce } from "@/lib/atribucion";

const cerca = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("entregados = efectividad × (1 − devoluciones)", () => {
  const r = calcular({ precio: 30, costo: 6, flete: 3, efectividad: 0.7, devoluciones: 0.15, gastoAdm: 1 }, null);
  cerca(r.entregados, 0.7 * 0.85);
});

test("CPA de equilibrio: el flete se paga sobre TODO lo despachado (× efectividad)", () => {
  const e = { precio: 30, costo: 6, flete: 3, efectividad: 0.7, devoluciones: 0.15, gastoAdm: 1 };
  const r = calcular(e, 5);
  const ent = 0.7 * 0.85;
  const esperado = 30 * ent - 6 * ent - 3 * 0.7 - 1 * ent;
  cerca(r.cpaBreakeven, esperado);
  // Con el flete × entregados (el error caro) daría más alto:
  assert.ok(r.cpaBreakeven < 30 * ent - 6 * ent - 3 * ent - 1 * ent);
  cerca(r.cpaObjetivo, esperado * 0.7);
  cerca(r.contribucion!, esperado - 5);
  cerca(r.cpaEfectivo!, 5 / ent);
});

test("sin CPA actual no se inventa contribución; sin entregados no hay CPA efectivo", () => {
  const r = calcular({ precio: 30, costo: 6, flete: 3, efectividad: 0, devoluciones: 0, gastoAdm: 0 }, 4);
  assert.equal(r.entregados, 0);
  assert.equal(r.cpaEfectivo, null);
  assert.equal(calcular({ precio: 1, costo: 0, flete: 0, efectividad: 1, devoluciones: 0, gastoAdm: 0 }, null).contribucion, null);
});

test("porcentajes fuera de rango se acotan a 0–1", () => {
  const r = calcular({ precio: 10, costo: 0, flete: 0, efectividad: 1.5, devoluciones: -0.2, gastoAdm: 0 }, null);
  assert.equal(r.entregados, 1);
});

test("cruce: la recompra solo explica hasta el tamaño de la brecha", () => {
  const r = leerCruce({ ordenesReales: 1000, atribuidas: 950, recompra: 200 });
  assert.equal(r.brecha, 50);
  assert.equal(r.porRecompra, 50);
  assert.equal(r.sinExplicar, 0);
});

test("cruce: sobreatribución (doble conteo) no genera brecha negativa", () => {
  const r = leerCruce({ ordenesReales: 7473, atribuidas: 8022, recompra: 10 });
  assert.equal(r.brecha, 0);
  cerca(r.sobreatribucion!, 8022 / 7473);
});

test("cruce: sin órdenes no hay división por cero", () => {
  const r = leerCruce({ ordenesReales: 0, atribuidas: 5, recompra: 0 });
  assert.equal(r.sobreatribucion, null);
  assert.equal(r.pesoSinExplicar, 0);
});
