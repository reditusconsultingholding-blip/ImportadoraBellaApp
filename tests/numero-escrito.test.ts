import { test } from "node:test";
import assert from "node:assert/strict";
import { aNumero } from "../src/lib/numero-escrito";

// El caso que rompió la calculadora: acá se escribe "28,50", no "28.50".
// Antes eso daba NaN, el `|| 0` lo volvía CERO, y el costo del producto
// pasaba a valer nada sin que se viera ningún error.
test("la coma es decimal, como se escribe acá", () => {
  assert.equal(aNumero("28,50"), 28.5);
  assert.equal(aNumero("79,99"), 79.99);
  assert.equal(aNumero("0,5"), 0.5);
});

test("el punto decimal sigue andando igual que antes", () => {
  assert.equal(aNumero("28.50"), 28.5);
  assert.equal(aNumero("79.99"), 79.99);
  assert.equal(aNumero("12"), 12);
  assert.equal(aNumero(7), 7);
});

// Con los dos separadores, el de más a la derecha es el decimal. Es cierto en
// las dos convenciones, así que no hay que adivinar cuál usó la persona.
test("miles y decimales juntos, en cualquiera de las dos convenciones", () => {
  assert.equal(aNumero("1.234,56"), 1234.56);
  assert.equal(aNumero("1,234.56"), 1234.56);
  assert.equal(aNumero("1.234.567,89"), 1234567.89);
  assert.equal(aNumero("1,234,567.89"), 1234567.89);
});

test("aguanta lo que viene pegado de otro lado", () => {
  assert.equal(aNumero("$ 28,50"), 28.5);
  assert.equal(aNumero(" 79,99 "), 79.99);
  assert.equal(aNumero("USD 1.200,00"), 1200);
});

test("lo que no es un número vale cero, no NaN", () => {
  assert.equal(aNumero(""), 0);
  assert.equal(aNumero("abc"), 0);
  assert.equal(aNumero(null), 0);
  assert.equal(aNumero(undefined), 0);
  assert.equal(aNumero(NaN), 0);
});

test("los negativos se respetan", () => {
  assert.equal(aNumero("-12,5"), -12.5);
  assert.equal(aNumero("-12.5"), -12.5);
});

// Un solo punto se deja como decimal: es lo que ya hacía y lo que espera quien
// escribe "28.5". Cambiarlo rompería lo que hoy funciona bien.
test("un solo punto sigue siendo decimal", () => {
  assert.equal(aNumero("1.234"), 1.234);
});
