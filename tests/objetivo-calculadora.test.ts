import { test } from "node:test";
import assert from "node:assert/strict";
import { cpaObjetivoCalculadora, objetivoAMostrar, objetivoDeAjuste } from "../src/lib/economia-calculadora";

// Gotas de drenaje linfático en la Calculadora el 23-nov: precio 32,99, costo 3,
// flete 6,69, gasto operativo 4, confirmación 73,02 %, devolución 15,31 %,
// margen 20 %. La Calculadora muestra CPA objetivo $7,11.
const gotas = {
  productCost: "3",
  shippingCost: "6.69",
  operatingCost: "4",
  mode: "margin",
  marginPct: "20",
  confirmationPct: "73.02",
  returnPct: "15.31",
  priceOverride: "32.99",
  ivaPct: "",
  gatewayFeePct: "",
};

test("el objetivo es el mismo CPA objetivo que muestra la Calculadora", () => {
  assert.equal(objetivoDeAjuste(gotas), 7.11);
  assert.equal(
    cpaObjetivoCalculadora({ precio: 32.99, produccion: 3, flete: 6.69, admin: 4, confirmacion: 0.7302, devoluciones: 0.1531 }),
    11.19,
  );
});

test("con coma decimal y sin confirmación", () => {
  assert.equal(objetivoDeAjuste({ ...gotas, shippingCost: "6,69" }), 7.11);
  assert.equal(objetivoDeAjuste({ ...gotas, confirmationPct: "" }), null);
});

test("el objetivo provisional de una ficha creada desde campañas no se muestra", () => {
  const calc = new Map([["gotas", 7.11]]);
  assert.equal(objetivoAMostrar({ id: "gotas", cpaTarget: 2.67, economiaDe: null }, calc), 7.11);
  assert.equal(objetivoAMostrar({ id: "otro", cpaTarget: 2.67, economiaDe: null }, calc), null);
  assert.equal(objetivoAMostrar({ id: "otro", cpaTarget: 5.2, economiaDe: "Planilla del equipo" }, calc), 5.2);
});
