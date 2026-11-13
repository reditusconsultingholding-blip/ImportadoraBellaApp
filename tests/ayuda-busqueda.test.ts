import test from "node:test";
import assert from "node:assert/strict";
import { buscarAyuda, normalizar, palabras, pasosDeLaPantalla } from "../src/lib/ayuda-busqueda";
import { PREGUNTAS } from "../src/lib/ayuda-preguntas";
import { PASOS, pasosParaUsuario } from "../src/lib/capacitacion-pasos";

const dueno = pasosParaUsuario({ rol: "OWNER", vePayroll: true, veCifras: true });

test("normaliza tildes, signos y mayúsculas", () => {
  assert.equal(normalizar("¿Cómo pongo TESTEO?"), "como pongo testeo");
  assert.deepEqual(palabras("¿Cómo le pongo etiquetas a un producto?"), ["pongo", "etiqu", "produ"]);
});

test("cada pregunta frecuente apunta a un paso que existe", () => {
  const ids = new Set(PASOS.map((p) => p.id));
  for (const q of PREGUNTAS) assert.ok(ids.has(q.pasoId), `${q.id} → ${q.pasoId}`);
});

test("una duda en palabras propias encuentra la pregunta de etiquetas", () => {
  const r = buscarAyuda("como le pongo testeo a un producto", PREGUNTAS, dueno);
  assert.ok(r.length > 0);
  assert.equal(r[0].tipo, "pregunta");
  assert.equal(r[0].tipo === "pregunta" && r[0].pregunta.id, "poner-etiquetas");
});

test("el CPA que no cuadra con Meta lleva a Shopify vs Ads", () => {
  const r = buscarAyuda("por qué el CPA no cuadra con meta", PREGUNTAS, dueno);
  assert.equal(r[0].tipo === "pregunta" && r[0].pregunta.pasoId, "control-shopify-ads");
});

test("sin palabras con contenido no responde nada", () => {
  assert.deepEqual(buscarAyuda("cómo se hace", PREGUNTAS, dueno), []);
});

test("a quien no ve cifras no le responde con pantallas de cifras", () => {
  const editor = pasosParaUsuario({ rol: "EDITOR", vePayroll: false, veCifras: false });
  const r = buscarAyuda("factor de diferencia con la plataforma", PREGUNTAS, editor);
  assert.ok(r.every((x) => (x.tipo === "pregunta" ? x.pregunta.pasoId : x.paso.id) !== "control-shopify-ads"));
});

test("en Control publicitario, la pestaña abierta va primero", () => {
  const riesgo = pasosDeLaPantalla(dueno, "/dashboard/control", "riesgo");
  assert.deepEqual(riesgo.map((p) => p.id), ["control-riesgo"]);
  const general = pasosDeLaPantalla(dueno, "/dashboard/control", null);
  assert.deepEqual(general.map((p) => p.id), ["control"]);
  // Una pestaña sin paso propio cae a los generales de la pantalla.
  assert.deepEqual(pasosDeLaPantalla(dueno, "/dashboard/control", "testeos").map((p) => p.id), ["control"]);
});
