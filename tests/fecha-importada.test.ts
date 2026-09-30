// Regresión de las tres piezas que quedaron fechadas en el año 2604.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaDeLaFila } from "@/lib/fecha-importada";

test("importación: '2604' no es una fecha, es una celda mal escrita", () => {
  // El caso real: la celda decía 2604 —26 de abril sin barra— y terminó siendo
  // el 1 de enero del año 2604. Tres creativos de CIARA desaparecieron de
  // todos los reportes sin un solo error.
  assert.equal(fechaDeLaFila("2604"), null);
  assert.equal(fechaDeLaFila("26/04"), null);
  assert.equal(fechaDeLaFila("26-04"), null);
  assert.equal(fechaDeLaFila("2604-01-01"), null, "el año 2604 no existe en esta operación");
});

test("importación: una fecha bien escrita se lee al mediodía UTC", () => {
  const d = fechaDeLaFila("2025-04-26");
  assert.ok(d);
  assert.equal(d.toISOString(), "2025-04-26T12:00:00.000Z");
});

test("importación: una celda vacía no inventa una fecha", () => {
  assert.equal(fechaDeLaFila(""), null);
  assert.equal(fechaDeLaFila("   "), null);
  assert.equal(fechaDeLaFila(null), null);
  assert.equal(fechaDeLaFila(undefined), null);
});

test("importación: un día que no existe no se corre al mes siguiente", () => {
  // new Date("2026-02-31") devuelve el 3 de marzo, calladito. Una fecha que
  // cambia sola es peor que una que falta: parece correcta.
  assert.equal(fechaDeLaFila("2026-02-31"), null);
  assert.equal(fechaDeLaFila("2026-13-01"), null);
});

test("importación: el año tiene que ser de esta operación", () => {
  assert.equal(fechaDeLaFila("1999-04-26"), null);
  assert.equal(fechaDeLaFila("2099-04-26"), null);
  assert.ok(fechaDeLaFila("2025-04-26"));
});
