// Regresión de la atribución campaña → producto y de los estados del contenido.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProduct } from "@/lib/integrations/windsor-sync";
import { parseCampaignRef } from "@/lib/product-code";
import { estadoDeTarea, marcaDeDia } from "@/lib/tarea-de-requerimiento";

const productos = [
  { id: "ginseng", code: "134142", name: "TE GINSENG", codigosAnteriores: [] },
  { id: "te", code: "100001", name: "TE", codigosAnteriores: [] },
  { id: "truly", code: "133795", name: "TRULY", codigosAnteriores: ["120001"] },
];

test("la campaña cae en su producto por el código del nombre", () => {
  assert.equal(matchProduct("134142 / TE GINSENG / ABO / COST CAP", productos), "ginseng");
});

test("el código viejo de un producto fusionado sigue cayendo en él", () => {
  assert.equal(matchProduct("120001 / TRULY MANTECA / ABO", productos), "truly");
});

test("por nombre gana el más largo: 'TE GINSENG' no cae en 'TE'", () => {
  assert.equal(matchProduct("CAMPAÑA TE GINSENG VERANO", productos), "ginseng");
});

test("sin código ni nombre conocido queda sin producto (no se adivina)", () => {
  assert.equal(matchProduct("NUEVO PRODUCTO X", productos), null);
});

test("nomenclatura {código}-{lote}: se lee el lote", () => {
  const r = parseCampaignRef("134142-3 / TE GINSENG / ABO");
  assert.equal(r?.code, "134142");
  assert.equal(r?.lote, 3);
});

test("estado del contenido: tarea nueva nace HECHO si la pieza ya está cerrada", () => {
  for (const s of ["APROBADO", "REALIZADO", "EDITADO", "TESTEADO"]) assert.equal(estadoDeTarea(s, false), "HECHO");
  for (const s of ["PENDIENTE", "EN_EDICION", "LISTO_PARA_REVISAR"]) assert.equal(estadoDeTarea(s, false), "PENDIENTE");
});

test("estado del contenido: una pieza abierta NO pisa el avance que marcó el editor", () => {
  assert.equal(estadoDeTarea("EN_EDICION", true), undefined);
  assert.equal(estadoDeTarea("LISTO_PARA_REVISAR", true), undefined);
  assert.equal(estadoDeTarea("APROBADO", true), "HECHO");
});

test("la fecha de entrega se trunca al día, sin correrla a Ecuador", () => {
  // Una entrega del 19 no puede aparecer en el tablero del 18.
  assert.equal(marcaDeDia(new Date("2026-09-19T00:00:00Z")).toISOString(), "2026-09-19T00:00:00.000Z");
  assert.equal(marcaDeDia(new Date("2026-09-19T17:45:00Z")).toISOString(), "2026-09-19T00:00:00.000Z");
});
