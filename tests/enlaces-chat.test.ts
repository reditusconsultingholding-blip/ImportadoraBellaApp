// Emilia, 23-nov: unir nombres hablándole a Jarvis. La base es la real, así
// que un cambio propuesto en una respuesta solo se aplica en otra posterior,
// con el código, y para la misma persona.
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmarCambio, limpiarAlias, proponerCambio } from "../src/lib/enlaces-chat";

const base = { organizationId: "org", userId: "emilia" };
const cambio = { tipo: "campana" as const, alias: "CAPSULA DE HONGOS", productId: "reishi" };

test("no se confirma en la misma respuesta en que se propuso", () => {
  const codigo = proponerCambio({ ...base, turno: "t1", cambio });
  const r = confirmarCambio({ ...base, codigo, turno: "t1" });
  assert.equal(r.ok, false);
  // Y sigue vivo para cuando la persona diga que sí.
  const r2 = confirmarCambio({ ...base, codigo: codigo.toLowerCase(), turno: "t2" });
  assert.deepEqual(r2, { ok: true, cambio });
});

test("un código se usa una sola vez", () => {
  const codigo = proponerCambio({ ...base, turno: "t1", cambio });
  assert.equal(confirmarCambio({ ...base, codigo, turno: "t2" }).ok, true);
  assert.equal(confirmarCambio({ ...base, codigo, turno: "t3" }).ok, false);
});

test("otra persona u otra empresa no puede usar el código", () => {
  const codigo = proponerCambio({ ...base, turno: "t1", cambio });
  assert.equal(confirmarCambio({ ...base, userId: "otro", codigo, turno: "t2" }).ok, false);
  assert.equal(confirmarCambio({ ...base, organizationId: "otra", codigo, turno: "t2" }).ok, false);
});

test("el código vence a los 30 minutos", () => {
  const ahora = 1_000_000;
  const codigo = proponerCambio({ ...base, turno: "t1", cambio }, ahora);
  assert.equal(confirmarCambio({ ...base, codigo, turno: "t2" }, ahora + 31 * 60_000).ok, false);
});

test("los otros nombres se guardan como en la ficha", () => {
  assert.equal(limpiarAlias("  cápsula   de hongos "), "CÁPSULA DE HONGOS");
  assert.equal(limpiarAlias("ab"), null);
});
