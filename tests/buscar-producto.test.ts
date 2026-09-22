import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarProductos, puntajeProducto } from "../src/lib/buscar-producto";

const catalogo = [
  { code: "177178", name: "GOTAS DE DRENAJE LINFATICO" },
  { code: "114953", name: "NIDA" },
  { code: "134142", name: "TE GINSENG" },
  { code: "134145", name: "Té Adelgazante Apple Rose" },
  { code: "63510", name: "LIFTING PRO DUO" },
];
const datos = (p: (typeof catalogo)[number]) => ({ nombre: p.name, codigo: p.code });
const nombres = (q: string) => buscarProductos(catalogo, q, datos).map((p) => p.name);

test("buscar producto: por iniciales", () => {
  assert.equal(nombres("gddl")[0], "GOTAS DE DRENAJE LINFATICO");
  // salteando la palabra "de"
  assert.equal(nombres("gdl")[0], "GOTAS DE DRENAJE LINFATICO");
  assert.equal(nombres("lpd")[0], "LIFTING PRO DUO");
});

test("buscar producto: por comienzo de palabras y sin tildes", () => {
  assert.equal(nombres("got dren")[0], "GOTAS DE DRENAJE LINFATICO");
  assert.equal(nombres("linfático")[0], "GOTAS DE DRENAJE LINFATICO");
  assert.deepEqual(nombres("te").slice(0, 2).sort(), ["TE GINSENG", "Té Adelgazante Apple Rose"]);
});

test("buscar producto: por código", () => {
  assert.equal(nombres("1771")[0], "GOTAS DE DRENAJE LINFATICO");
  assert.equal(nombres("114953")[0], "NIDA");
});

test("buscar producto: lo que no coincide no aparece", () => {
  assert.deepEqual(nombres("zzz"), []);
  assert.equal(puntajeProducto("", "NIDA"), 0);
});

// El SKU de Dropi es el otro número del producto: Fabricio lo pone adelante en
// el nombre de sus campañas y busca por él. Tiene que encontrar igual que el
// código, sin que uno le gane al otro por estar primero en la lista.
test("encuentra por el SKU de Dropi además de por el código", () => {
  const codigos = ["134142", "177118"];
  assert.equal(puntajeProducto("177118", "GOTAS DE DRENAJE LINFATICO", codigos), 0);
  assert.equal(puntajeProducto("134142", "GOTAS DE DRENAJE LINFATICO", codigos), 0);
  assert.equal(puntajeProducto("1771", "GOTAS DE DRENAJE LINFATICO", codigos), 1);
  // Un número que no es de ninguno de los dos no lo encuentra por número.
  assert.equal(puntajeProducto("999999", "GOTAS DE DRENAJE LINFATICO", codigos), null);
  // Y sin SKU sigue andando igual que antes.
  assert.equal(puntajeProducto("134142", "GOTAS", ["134142", null]), 0);
  // Iniciales salteando palabras: las de verdad son g-d-d-l.
  assert.equal(puntajeProducto("gdl", "Gotas De drenaje Linfático", []), 6);
});
