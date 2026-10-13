// Regresión de la economía que sale de la Calculadora de precios.
//
// Emilia pidió que el control publicitario tome los números de ahí en vez del
// archivo mensual de administración, que llega tarde. Lo que se prueba acá es
// la parte que se puede equivocar en silencio: el CPA máximo y los números
// escritos con coma.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpaMaximo } from "@/lib/economia-calculadora";
import { mezclarConElMes } from "@/lib/control-publicitario";

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

// ---------------------------------------------------------------------------
// La fila del mes a medio llenar: el caso que dejó 16 productos en pérdida.

test("una fila del mes con solo el costo no borra el precio de la calculadora", () => {
  // ACEITE ANTICELULITIS, octubre 2026: alguien anotó la producción y dejó el
  // resto en cero. Antes ese cero pisaba el precio y el Control calculaba
  // ingresos = 0 → utilidad = menos todo el gasto de pauta.
  const r = mezclarConElMes(
    {
      efectividad: 0.7,
      produccion: 8.25,
      flete: 6.24,
      precioProm: 32.99,
      cpaMin: 10.77,
      devoluciones: 0.18,
      delMes: false,
      origen: "calculadora",
    },
    { efectividad: 0, produccion: 5.95, flete: 0, precioProm: 0, cpaMin: null, devoluciones: null },
  );
  assert.equal(r.precioProm, 32.99, "el precio sigue viniendo de la calculadora");
  assert.equal(r.efectividad, 0.7, "la efectividad también");
  assert.equal(r.produccion, 5.95, "pero el costo que SÍ se cargó manda");
  assert.equal(r.origen, "calculadora", "y la pantalla tiene que poder decirlo");
  assert.equal(r.delMes, false);
});

test("una fila del mes completa manda, aunque la calculadora diga otra cosa", () => {
  const r = mezclarConElMes(
    {
      efectividad: 0.7,
      produccion: 8.25,
      flete: 6.24,
      precioProm: 32.99,
      cpaMin: 10.77,
      devoluciones: 0.18,
      delMes: false,
      origen: "calculadora",
    },
    { efectividad: 0.58, produccion: 9, flete: 5.61, precioProm: 29.99, cpaMin: 8, devoluciones: 0.1 },
  );
  assert.equal(r.precioProm, 29.99);
  assert.equal(r.efectividad, 0.58);
  assert.equal(r.origen, "mes", "es el dato oficial del mes");
  assert.equal(r.delMes, true);
});

test("un flete en cero sí pasa: un envío bonificado es creíble", () => {
  const r = mezclarConElMes(
    {
      efectividad: 0.7,
      produccion: 8.25,
      flete: 6.24,
      precioProm: 32.99,
      cpaMin: null,
      devoluciones: null,
      delMes: false,
      origen: "calculadora",
    },
    { efectividad: 0.58, produccion: 9, flete: 0, precioProm: 29.99, cpaMin: null, devoluciones: null },
  );
  assert.equal(r.flete, 0);
  assert.equal(r.origen, "mes");
});

test("sin nada debajo, una fila a medias no inventa un precio", () => {
  const r = mezclarConElMes(undefined, {
    efectividad: 0,
    produccion: 5.95,
    flete: 0,
    precioProm: 0,
    cpaMin: null,
    devoluciones: null,
  });
  assert.equal(r.precioProm, 0);
  assert.equal(r.origen, "ficha", "y queda marcado como lo más flojo que hay");
});
