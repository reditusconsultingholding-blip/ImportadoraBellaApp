import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDelMes, etiquetaDelMes, mesesRecientes, separarClave } from "../src/lib/clave-calculadora";

test("la clave de un mes va y vuelve", () => {
  assert.equal(claveDelMes("BODY", "2026-11"), "BODY @ 2026-11");
  assert.deepEqual(separarClave("BODY @ 2026-11"), { producto: "BODY", mes: "2026-11" });
  // El histórico de siempre no tiene mes, aunque el nombre traiga números o arrobas.
  assert.deepEqual(separarClave("KIT: 1 LOCIÓN MAGNESIO + 10 PADS"), { producto: "KIT: 1 LOCIÓN MAGNESIO + 10 PADS", mes: null });
  assert.deepEqual(separarClave("Combo @ casa 2026"), { producto: "Combo @ casa 2026", mes: null });
});

test("los meses de la Calculadora, del más reciente hacia atrás", () => {
  assert.deepEqual(mesesRecientes(new Date("2026-11-20T00:00:00Z"), 3), ["2026-11", "2026-10", "2026-09"]);
  assert.deepEqual(mesesRecientes(new Date("2027-01-05T00:00:00Z"), 2), ["2027-01", "2026-12"]);
  assert.equal(etiquetaDelMes("2026-09"), "septiembre 2026");
});
