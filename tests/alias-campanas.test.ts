import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProduct } from "../src/lib/integrations/windsor-sync";

const productos = [
  { id: "vital", code: "211748", name: "VITALDROPS", aliasCampanas: ["VITAL DROP"] },
  { id: "hongos", code: "TEST-HONGOS", name: "Cápsula hongos de nieve", aliasCampanas: ["TREMELLA", "TERMELLA", "HONGOS DE NIEVE"] },
  { id: "cafe", code: "999", name: "CAFE DE HONGOS" },
  { id: "pil", code: "TEST-PIL", name: "PIL (kit de barra de Pilates)", aliasCampanas: ["KIT PILATES", "KIT DE BARRA DE PILATES", "KIT DE BARRAS"] },
];

test("las campañas de prueba sin código caen por sus otros nombres", () => {
  assert.equal(matchProduct("VITAL DROP EV/CBO/ TESTEO/ 21.11.26", productos), "vital");
  assert.equal(matchProduct("TREMELLA-TESTEO-21.11.26", productos), "hongos");
  assert.equal(matchProduct("TERMELLA HONGO TESTEO/22.11.26", productos), "hongos");
  assert.equal(matchProduct("CAPSULA HONGOS DE NIEVE/18.11.2026", productos), "hongos");
  assert.equal(matchProduct("KIT PILATES EN CASA / ABO / TESTEO / 22.11.2026", productos), "pil");
  assert.equal(matchProduct("KIT DE BARRAS/22.11.2026", productos), "pil");
});

test("un alias es palabra entera y no se roba otra campaña", () => {
  assert.equal(matchProduct("CAFE DE HONGOS / TEST", productos), "cafe");
  assert.equal(matchProduct("SOLICITUD DE PERSONAL VENTAS", productos), null);
});
