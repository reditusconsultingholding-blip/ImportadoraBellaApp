import { test } from "node:test";
import assert from "node:assert/strict";
import { esTesteoEnPeriodo, mesesDelPeriodo, mesesTrasEtiqueta } from "../src/lib/etiquetas-producto";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("los meses de un período, de punta a punta", () => {
  assert.deepEqual(mesesDelPeriodo(d("2026-09-01"), d("2026-09-30")), ["2026-09"]);
  assert.deepEqual(mesesDelPeriodo(d("2026-10-15"), d("2026-11-19")), ["2026-10", "2026-11"]);
  assert.deepEqual(mesesDelPeriodo(d("2026-12-20"), d("2027-01-05")), ["2026-12", "2027-01"]);
});

test("un testeo lo es en su mes: Cutting Mix en septiembre sí, en octubre no", () => {
  const cutting = { etiquetas: [], testeoMeses: ["2026-09"] };
  assert.equal(esTesteoEnPeriodo(cutting, ["2026-09"]), true);
  assert.equal(esTesteoEnPeriodo(cutting, ["2026-10"]), false);
  // Fwee: octubre y noviembre.
  const fwee = { etiquetas: ["TESTEO"], testeoMeses: ["2026-10", "2026-11"] };
  assert.equal(esTesteoEnPeriodo(fwee, ["2026-09"]), false);
  assert.equal(esTesteoEnPeriodo(fwee, ["2026-11"]), true);
});

test("sin meses anotados, la etiqueta Testeo vale como antes", () => {
  assert.equal(esTesteoEnPeriodo({ etiquetas: ["TESTEO"], testeoMeses: [] }, ["2026-09"]), true);
  assert.equal(esTesteoEnPeriodo({ etiquetas: ["ACTIVO"], testeoMeses: [] }, ["2026-09"]), false);
  assert.equal(esTesteoEnPeriodo({ etiquetas: ["TESTEO"] }, ["2026-09"]), true);
});

test("poner o quitar Testeo mueve solo el mes en curso", () => {
  const conMeses = { etiquetas: [] as string[], testeoMeses: ["2026-09"] };
  assert.deepEqual(mesesTrasEtiqueta(conMeses, ["TESTEO"], "2026-11"), ["2026-09", "2026-11"]);
  const enPrueba = { etiquetas: ["TESTEO"], testeoMeses: ["2026-10", "2026-11"] };
  assert.deepEqual(mesesTrasEtiqueta(enPrueba, [], "2026-11"), ["2026-10"]);
  // Sin meses anotados no se inventan: manda la etiqueta.
  assert.deepEqual(mesesTrasEtiqueta({ etiquetas: [], testeoMeses: [] }, ["TESTEO"], "2026-11"), []);
});
