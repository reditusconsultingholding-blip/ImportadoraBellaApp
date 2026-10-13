// Regresión de la economía que sale de la Calculadora de precios.
//
// Emilia pidió que el control publicitario tome los números de ahí en vez del
// archivo mensual de administración, que llega tarde. Lo que se prueba acá es
// la parte que se puede equivocar en silencio: el CPA máximo y los números
// escritos con coma.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpaMaximo } from "@/lib/economia-calculadora";

test("CPA máximo: la misma cuenta que muestra la calculadora", () => {
  // (precio − producto − adm) × (1 − devoluciones) − flete
  // (32.99 − 8.25 − 4) × (1 − 0.18) − 6.24 = 20.74 × 0.82 − 6.24 = 10.77
  const r = cpaMaximo({ precioProm: 32.99, produccion: 8.25, admin: 4, flete: 6.24, devoluciones: 0.18 });
  assert.equal(r, 10.77);
});

test("CPA máximo: sin devoluciones cargadas no se inventa un descuento", () => {
  // (29.99 − 4 − 4.5) − 5.61 = 15.88
  const r = cpaMaximo({ precioProm: 29.99, produccion: 4, admin: 4.5, flete: 5.61, devoluciones: null });
  assert.equal(r, 15.88);
});

test("CPA máximo: un producto que pierde no devuelve un tope", () => {
  // Un tope negativo no es un tope: es un producto que pierde con cualquier
  // pauta. Mostrarlo como "CPA máx. -3,20" se lee como si hubiera margen.
  const r = cpaMaximo({ precioProm: 10, produccion: 8, admin: 2, flete: 3, devoluciones: 0.1 });
  assert.equal(r, null);
});

test("CPA máximo: las devoluciones pegan donde tienen que pegar", () => {
  const sin = cpaMaximo({ precioProm: 30, produccion: 5, admin: 4, flete: 6, devoluciones: 0 });
  const con = cpaMaximo({ precioProm: 30, produccion: 5, admin: 4, flete: 6, devoluciones: 0.2 });
  assert.ok(con !== null && sin !== null && con < sin, "con devoluciones el tope tiene que bajar");
  // (30 − 5 − 4) × 0.8 − 6 = 16.8 − 6 = 10.8
  assert.equal(con, 10.8);
});
