import { test } from "node:test";
import assert from "node:assert/strict";
import { fichaPorProductId } from "../src/lib/auto-enlace";

const porNombre = new Map([["desodorante truly unicorn fruit", "truly-anterior"]]);
const porCodigo = new Map([
  ["133795", "mantequilla"],
  ["192024", "sungboon-glow"],
]);

test("sin el sufijo, el nombre ya enlazado manda", () => {
  assert.equal(
    fichaPorProductId("Desodorante Truly Unicorn Fruit - Product Id: 133801", porNombre, porCodigo),
    "truly-anterior",
  );
});

test("si el nombre no está, el número es el código de una ficha", () => {
  assert.equal(
    fichaPorProductId("SUNGBOON EDITOR Glow PDRN Ampolla - Product Id: 192024 - Variation Id: 1", porNombre, porCodigo),
    "sungboon-glow",
  );
});

test("lo que no se puede asegurar no se enlaza", () => {
  // Sin sufijo: lo decide una persona en «Enlazar pedidos».
  assert.equal(fichaPorProductId("URO Probiótico Vaginal para mujeres", porNombre, porCodigo), null);
  // Código desconocido.
  assert.equal(fichaPorProductId("Algo nuevo - Product Id: 999999", porNombre, porCodigo), null);
  // Varios productos en una sola línea.
  assert.equal(
    fichaPorProductId("A - Product Id: 133795 - Variation Id: 1, B - Product Id: 192024 - Variation Id: 2", porNombre, porCodigo),
    null,
  );
});
