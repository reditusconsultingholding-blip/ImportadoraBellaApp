import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contarPestana,
  fechaDelReporte,
  filasDeCsv,
  indiceDeProducto,
} from "../src/lib/integrations/reporte-ventas";

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

  const lectura = contarPestana(csv);
  assert.ok(lectura.ok);
  const filas = lectura.filas;
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

test("una pestaña sin las columnas que importan se reporta rota, no vacía", () => {
  const sinColumnas = contarPestana("ASESOR,TOTAL\nMELANIE,154\n");
  assert.equal(sinColumnas.ok, false);

  // Una pestaña recién creada, sin pedidos todavía, NO es un error: el mes que
  // arranca tiene el encabezado puesto y ninguna fila.
  assert.equal(contarPestana("").ok, true);
});

test("el encabezado roto de octubre: «TOD» en vez de «PRODUCTO»", () => {
  // Lo que pasó de verdad: el 6 de octubre de 2026 alguien escribió "TOD"
  // encima del encabezado "PRODUCTO" de la pestaña OCTUBRE. La pestaña pasó a
  // devolver cero filas, cero se leía igual que "no cambió nada", y el control
  // publicitario se quedó seis días sin 1.911 pedidos sin que nadie lo notara.
  const roto = [
    "Columna 1,FECHA,HORA,NOMBRE,Column 5,TOD,VALOR,CANTIDAD,ESTADO",
    "#1,07/10/2026,10:00,Ana,Funnelish,BELTROX Cinturon sin hebilla,20,1,CONFIRMADO",
    "#2,07/10/2026,11:00,Luis,Funnelish,BELTROX Cinturon sin hebilla,20,2,PENDIENTE",
    "",
  ].join("\n");

  // Sin respaldo se reporta rota, y el motivo nombra el encabezado que sí tiene
  // para que arreglarlo en la planilla sea obvio.
  const sola = contarPestana(roto);
  assert.equal(sola.ok, false);
  if (!sola.ok) {
    assert.match(sola.motivo, /PRODUCTO/);
    assert.match(sola.motivo, /TOD/);
  }

  // Con el respaldo que dan las otras pestañas del libro —la columna 5, donde
  // septiembre y agosto tienen PRODUCTO— el dato entra igual.
  const conRespaldo = contarPestana(roto, 5);
  assert.ok(conRespaldo.ok);
  assert.equal(conRespaldo.filas.length, 1);
  assert.equal(conRespaldo.filas[0].pedidos, 2);
  assert.equal(conRespaldo.filas[0].productoTexto, "BELTROX Cinturon sin hebilla");
});

test("el respaldo por posición no inventa una columna que no existe", () => {
  // Si el encabezado es más corto que la posición de respaldo, se reporta rota
  // en vez de leer basura de una columna que no está.
  assert.equal(contarPestana("ASESOR,TOTAL\nMELANIE,154\n", 5).ok, false);
});

test("indiceDeProducto acepta los nombres que escribe una persona", () => {
  assert.equal(indiceDeProducto(["FECHA", "PRODUCTO"]), 1);
  assert.equal(indiceDeProducto(["FECHA", "Productos"]), 1);
  assert.equal(indiceDeProducto(["FECHA", " artículo "]), 1);
  // "TOD" no se acepta como sinónimo: es un error de tipeo, y codificarlo sería
  // dar por bueno el encabezado roto en vez de pedir que lo arreglen.
  assert.equal(indiceDeProducto(["FECHA", "TOD"]), -1);
  assert.equal(indiceDeProducto(["FECHA", "VALOR"]), -1);
});
