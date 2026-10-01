// El filtro de visibilidad se anulaba solo.
//
// "¿Qué piezas puedo ver?" y "¿qué entra en estas fechas?" son dos filtros y
// los dos usan la clave OR. Se combinaban con spread, así que el de fechas
// borraba al de visibilidad — y como la pantalla SIEMPRE manda fechas, cada
// editora recibía las piezas de toda la empresa.
//
// No falló nada. Dejó de filtrar, en silencio. Desde el lado del equipo se
// veía como "no puedo editar algunos productos", y se reportó tres veces como
// un problema de permisos de edición.
import { test } from "node:test";
import assert from "node:assert/strict";
import { combinarFiltros } from "@/lib/responsables";

const VISIBILIDAD = { OR: [{ ownerId: "usr_ana" }, { productId: { in: ["p1", "p2"] } }] };
const FECHAS = { OR: [{ dueDate: { gte: "2026-09-01" } }, { AND: [{ dueDate: null }] }] };

test("dos filtros con la misma clave no se pisan", () => {
  const r = combinarFiltros(VISIBILIDAD, FECHAS) as { AND?: object[] };
  assert.ok(Array.isArray(r.AND), "tienen que quedar los dos, dentro de un AND");
  assert.equal(r.AND.length, 2);
  assert.deepEqual(r.AND[0], VISIBILIDAD);
  assert.deepEqual(r.AND[1], FECHAS);
});

test("el spread era el error: lo reproducimos para dejarlo documentado", () => {
  const comoEstabaAntes = { ...VISIBILIDAD, ...FECHAS };
  // Una sola clave OR, y es la de fechas: la visibilidad desapareció entera.
  assert.deepEqual(Object.keys(comoEstabaAntes), ["OR"]);
  assert.deepEqual(comoEstabaAntes.OR, FECHAS.OR);
  // Con combinarFiltros eso no puede pasar.
  const ahora = JSON.stringify(combinarFiltros(VISIBILIDAD, FECHAS));
  assert.ok(ahora.includes("usr_ana"), "la visibilidad tiene que seguir ahí");
});

test("un filtro vacío no agrega un AND al pedo", () => {
  assert.deepEqual(combinarFiltros(VISIBILIDAD, {}), VISIBILIDAD);
  assert.deepEqual(combinarFiltros({}, FECHAS), FECHAS);
  assert.deepEqual(combinarFiltros({}, {}), {});
});

test("dirección ve todo: filtro vacío de visibilidad, pero las fechas siguen", () => {
  // piezasVisibles devuelve {} para quien dirige. El rango no se puede perder.
  const r = combinarFiltros({}, FECHAS);
  assert.deepEqual(r, FECHAS);
});
