// Regresión de las fórmulas del control publicitario (src/lib/control-calculo.ts).
// Si una de estas pruebas falla, cambió un número que ve dirección.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpa, DIAS_DEL_MES, economiaDeFila, repartoAdministrativo, sumarFilas, utilidad } from "@/lib/control-calculo";
import { filasDelDia } from "@/lib/control-relleno";

const cerca = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test("economía de una fila: efectivos, ingresos y operativos = (producción + flete) × efectivos", () => {
  const r = economiaDeFila(100, { efectividad: 0.6, produccion: 5, flete: 3, precioProm: 30 });
  cerca(r.pedidosEfectivos, 60);
  cerca(r.ingresos, 1800);
  // NO el $6,15 fijo del Excel (CPA mínimo + % devoluciones): producción + flete.
  cerca(r.gastosOperativos, 480);
});

test("sin economía cargada, la fila no inventa ingresos ni costos", () => {
  const r = economiaDeFila(50, undefined);
  assert.deepEqual(r, { efectividad: 0, pedidosEfectivos: 0, gastosOperativos: 0, precioProm: 0, ingresos: 0 });
});

test("gasto administrativo: total del mes ÷ 30, repartido por pedidos del DÍA entero", () => {
  assert.equal(DIAS_DEL_MES, 30);
  // $22.713 de abril, 300 pedidos en el día, la fila tiene 100.
  cerca(repartoAdministrativo(22713, 300, 100), 22713 / 30 / 3);
  // Las filas de un día suman exactamente el monto diario.
  const suma = [100, 150, 50].reduce((a, p) => a + repartoAdministrativo(22713, 300, p), 0);
  cerca(suma, 22713 / 30, 1e-6);
  // Día sin pedidos: nada que repartir (y sin dividir por cero).
  assert.equal(repartoAdministrativo(22713, 0, 0), 0);
});

test("utilidad = ingresos − pauta − operativos − administrativos", () => {
  cerca(utilidad(1800, 600, 480, 252.37), 1800 - 600 - 480 - 252.37);
  // La fila sin producto: sin ingresos, pierde la pauta y su parte de adm.
  cerca(utilidad(0, 959, 0, 40), -999);
});

test("CPA sobre pedidos reales; sin pedidos es 0, no Infinity", () => {
  cerca(cpa(45513, 7473), 45513 / 7473);
  assert.equal(cpa(100, 0), 0);
});

test("totales: el CPA y el margen se recalculan sobre las sumas, no se promedian", () => {
  const t = sumarFilas([
    { pedidos: 3, pedidosPlataforma: 4, gasto: 90, ingresos: 100, gastosOperativos: 10, gastosAdm: 5, utilidad: -5 },
    { pedidos: 300, pedidosPlataforma: 320, gasto: 900, ingresos: 5000, gastosOperativos: 1000, gastosAdm: 100, utilidad: 3000 },
  ]);
  assert.equal(t.pedidos, 303);
  cerca(t.cpa, 990 / 303); // promediar daría (30 + 3) / 2 = 16,5
  cerca(t.margen, 2995 / 5100);
});

test("filas del día: el gasto sin producto no desaparece, va a su fila", () => {
  const fecha = new Date("2026-07-15T00:00:00Z");
  const { productos, sinAsignar } = filasDelDia(
    "org",
    fecha,
    23,
    [
      { productId: "A", pedidos: 10, gasto: 100 },
      { productId: null, pedidos: 2, gasto: 40 },
      { productId: null, pedidos: 1, gasto: 10 },
    ],
    { fecha, porProducto: new Map([["A", 8], ["B", 3]]), sinAsignar: 5, testeo: 2 },
  );
  assert.equal(sinAsignar.gasto, 50);
  assert.equal(sinAsignar.pedidosPlataforma, 3);
  assert.equal(sinAsignar.pedidosReales, 5);
  const a = productos.find((p) => p.productId === "A")!;
  assert.equal(a.gasto, 100);
  assert.equal(a.pedidos, 10); // lo que dice la plataforma
  assert.equal(a.pedidosReales, 8); // lo que vendió la tienda
  // B vendió sin pauta ese día: aparece con gasto 0.
  const b = productos.find((p) => p.productId === "B")!;
  assert.equal(b.gasto, 0);
  assert.equal(b.pedidosReales, 3);
  // El testeo no entra en ninguna fila.
  assert.equal(productos.reduce((s, p) => s + p.pedidosReales, 0) + sinAsignar.pedidosReales, 16);
});
