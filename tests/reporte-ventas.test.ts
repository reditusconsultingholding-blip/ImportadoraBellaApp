import { test } from "node:test";
import assert from "node:assert/strict";
import { contarPestana, fechaDelReporte, filasDeCsv } from "../src/lib/integrations/reporte-ventas";

// El CSV de la planilla trae comas dentro de la dirección y comillas dentro de
// las observaciones. Partir por comas corre las columnas de ese renglón y el
// pedido termina contado con el nombre del asesor como producto: es un error
// que no rompe nada, solo devuelve números mal.
test("el parser respeta las comas y las comillas de adentro", () => {
  const csv = 'FECHA,PRODUCTO,CANTIDAD\n"13/09/2026","Crema, la grande","2"\n';
  const filas = filasDeCsv(csv);
  assert.deepEqual(filas[1], ["13/09/2026", "Crema, la grande", "2"]);

  const conComillas = 'A,B\n"dijo ""no""",x\n';
  assert.deepEqual(filasDeCsv(conComillas)[1], ['dijo "no"', "x"]);
});

test("las fechas imposibles se descartan en vez de correrse de mes", () => {
  assert.equal(fechaDelReporte("13/09/2026")?.toISOString(), "2026-09-13T00:00:00.000Z");
  assert.equal(fechaDelReporte("1/9/2026")?.toISOString(), "2026-09-01T00:00:00.000Z");
  // El 31 de abril no existe: sin el control, Date lo convierte en el 1 de mayo
  // y esos pedidos se irían al mes siguiente.
  assert.equal(fechaDelReporte("31/04/2026"), null);
  assert.equal(fechaDelReporte("TOTAL"), null);
  assert.equal(fechaDelReporte(""), null);
});

// La regla del negocio, la que hace que el control cuadre con lo que el equipo
// lee en su planilla: un pedido es UNA FILA, no la suma de las unidades.
test("un pedido es una fila y cuentan todos los estados", () => {
  const csv = [
    "Column 2,FECHA,PRODUCTO,CANTIDAD,ESTADO",
    "#1,13/09/2026,CEPILLO DE INODORO,3,CONFIRMADO",
    "#2,13/09/2026,Cepillo de Inodoro,2,PENDIENTE",
    "#3,13/09/2026,CEPILLO DE INODORO,1,CANCELADO",
    "#4,14/09/2026,CEPILLO DE INODORO,5,REAGENDADO",
    "#5,SIN FECHA,CEPILLO DE INODORO,9,CONFIRMADO",
    "",
  ].join("\n");

  const filas = contarPestana(csv);
  const trece = filas.find((f) => f.fecha.toISOString().startsWith("2026-09-13"));
  assert.ok(trece);
  // Tres filas, aunque sumen seis unidades. Y el cancelado cuenta.
  assert.equal(trece.pedidos, 3);
  assert.equal(trece.unidades, 6);
  assert.equal(trece.confirmados, 1);
  assert.equal(trece.pendientes, 1);
  assert.equal(trece.cancelados, 1);

  // Mayúsculas distintas son el mismo producto: se agrupa por el nombre
  // normalizado, no por el texto.
  assert.equal(filas.filter((f) => f.fecha.toISOString().startsWith("2026-09-13")).length, 1);

  // La fila sin fecha válida no entra en ningún día.
  assert.equal(filas.reduce((a, f) => a + f.pedidos, 0), 4);
});

test("una pestaña sin las columnas que importan no devuelve nada", () => {
  assert.deepEqual(contarPestana("ASESOR,TOTAL\nMELANIE,154\n"), []);
  assert.deepEqual(contarPestana(""), []);
});
