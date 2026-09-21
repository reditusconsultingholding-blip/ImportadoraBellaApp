// Regresión del video de Emilia del 21 de septiembre: el día que sale del
// calendario de Notion y las páginas "act emi" con sus casillas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { actividadDelTitulo, creativosDeTexto, diaDeInicio } from "@/lib/integrations/notion-import";

test("notion: la fecha de la página del calendario es el día ecuatoriano", () => {
  assert.equal(diaDeInicio("2026-09-19")?.toISOString(), "2026-09-19T00:00:00.000Z");
  // Con hora: 21 de septiembre a la 1 a. m. UTC todavía es 20 en Ecuador.
  assert.equal(diaDeInicio("2026-09-21T01:00:00.000Z")?.toISOString(), "2026-09-20T00:00:00.000Z");
  assert.equal(diaDeInicio("2026-09-21T09:00:00.000-05:00")?.toISOString(), "2026-09-21T00:00:00.000Z");
  assert.equal(diaDeInicio(null), null);
  assert.equal(diaDeInicio("no es fecha"), null);
});

test("notion: las páginas de actividades se reconocen como las escribe el equipo", () => {
  for (const titulo of ["act emi", "ACT EMI", "ACTE MI", "ACTEMI", "emi act", "Act. Emi"]) {
    assert.deepEqual(actividadDelTitulo(titulo), { quien: "emi" }, titulo);
  }
  assert.deepEqual(actividadDelTitulo("actividades majo"), { quien: "majo" });
});

test("notion: lo que no es una página de actividades no se toma como tal", () => {
  assert.equal(actividadDelTitulo("CONTENIDO DEL DÍA"), null);
  assert.equal(actividadDelTitulo("CONTENIDO act"), null);
  assert.equal(actividadDelTitulo("Nuevo/a con campaña"), null);
  assert.equal(actividadDelTitulo("act"), null);
  assert.equal(actividadDelTitulo("Contacto"), null);
  assert.equal(actividadDelTitulo("Impacto de la campaña de ginseng en ventas"), null);
});

test("notion: los creativos se leen del texto de la casilla", () => {
  assert.equal(creativosDeTexto("5 CREATIVOS COMBO CYPERUS"), 5);
  assert.equal(creativosDeTexto("12 creativos de gotas de drenaje linfático"), 12);
  assert.equal(creativosDeTexto("REVISAR CV"), 0);
});
