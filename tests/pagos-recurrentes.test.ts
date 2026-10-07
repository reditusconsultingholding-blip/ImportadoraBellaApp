// Regresión de los recordatorios de pago de apps.
//
// Lo que se prueba acá es el calendario, que es donde esto se rompe: el día 31
// en meses que no lo tienen, febrero, y que un aviso no salga dos veces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisosDeHoy, diaDeCobro, textoDelAviso, type PagoParaAvisar } from "@/lib/pagos-recurrentes";

const pago = (extra: Partial<PagoParaAvisar> = {}): PagoParaAvisar => ({
  id: "p1",
  nombre: "Releasit",
  monto: 29.99,
  moneda: "USD",
  diaDelMes: 10,
  avisarDiasAntes: 3,
  activo: true,
  avisoPrevioEn: null,
  avisoDiaEn: null,
  ...extra,
});

const dia = (a: number, m: number, d: number) => new Date(Date.UTC(a, m - 1, d));

test("cobro: el día 31 cae el último día en los meses que no lo tienen", () => {
  assert.equal(diaDeCobro(2026, 10, 31), 31); // octubre tiene 31
  assert.equal(diaDeCobro(2026, 4, 31), 30); // abril, 30
  assert.equal(diaDeCobro(2026, 2, 31), 28); // febrero
  assert.equal(diaDeCobro(2028, 2, 31), 29); // bisiesto
  assert.equal(diaDeCobro(2026, 6, 15), 15); // uno normal no se toca
});

test("avisos: una app que cobra el 31 SÍ avisa en abril", () => {
  // El caso que motivó el recorte: buscando el día exacto, abril no avisaba
  // nunca — y el cobro ocurre igual, el 30.
  const abril30 = avisosDeHoy([pago({ diaDelMes: 31 })], dia(2026, 4, 30));
  assert.equal(abril30.length, 1);
  assert.equal(abril30[0].tipo, "dia");
  assert.equal(abril30[0].diaEfectivo, 30);
});

test("avisos: sale el previo dentro de la ventana y no antes", () => {
  const p = [pago({ diaDelMes: 10, avisarDiasAntes: 3 })];
  assert.equal(avisosDeHoy(p, dia(2026, 10, 6)).length, 0, "cuatro días antes todavía no");
  const siete = avisosDeHoy(p, dia(2026, 10, 7));
  assert.equal(siete.length, 1);
  assert.equal(siete[0].tipo, "previo");
  assert.equal(siete[0].faltan, 3);
});

test("avisos: el mismo día es su propio aviso", () => {
  const hoy = avisosDeHoy([pago({ diaDelMes: 10 })], dia(2026, 10, 10));
  assert.equal(hoy.length, 1);
  assert.equal(hoy[0].tipo, "dia");
  assert.equal(hoy[0].faltan, 0);
});

test("avisos: después del cobro no se insiste", () => {
  assert.equal(avisosDeHoy([pago({ diaDelMes: 10 })], dia(2026, 10, 11)).length, 0);
  assert.equal(avisosDeHoy([pago({ diaDelMes: 10 })], dia(2026, 10, 25)).length, 0);
});

test("avisos: lo ya avisado este mes no se repite, pero el mes siguiente sí", () => {
  // Sin esto el aviso saldría en cada vuelta del reloj, decenas por día.
  const yaAvisado = pago({ diaDelMes: 10, avisoPrevioEn: "2026-10" });
  assert.equal(avisosDeHoy([yaAvisado], dia(2026, 10, 8)).length, 0);
  // Noviembre es otro período: vuelve a avisar.
  assert.equal(avisosDeHoy([yaAvisado], dia(2026, 11, 8)).length, 1);
});

test("avisos: el previo y el del día son independientes", () => {
  // Haber avisado antes no se come el aviso del día del cobro.
  const conPrevio = pago({ diaDelMes: 10, avisoPrevioEn: "2026-10" });
  const elDia = avisosDeHoy([conPrevio], dia(2026, 10, 10));
  assert.equal(elDia.length, 1);
  assert.equal(elDia[0].tipo, "dia");
});

test("avisos: una app apagada no avisa", () => {
  assert.equal(avisosDeHoy([pago({ activo: false, diaDelMes: 10 })], dia(2026, 10, 10)).length, 0);
});

test("texto: se lee distinto hoy, mañana y en varios días", () => {
  const base = { diaEfectivo: 10, periodo: "2026-10" };
  assert.match(
    textoDelAviso({ pago: pago(), tipo: "dia", faltan: 0, ...base }),
    /^Hoy se cobra Releasit/,
  );
  assert.match(
    textoDelAviso({ pago: pago(), tipo: "previo", faltan: 1, ...base }),
    /^Mañana se cobra Releasit/,
  );
  assert.match(
    textoDelAviso({ pago: pago(), tipo: "previo", faltan: 3, ...base }),
    /^En 3 días se cobra Releasit/,
  );
  // Sin monto cargado, el aviso igual sirve.
  assert.match(
    textoDelAviso({ pago: pago({ monto: null }), tipo: "dia", faltan: 0, ...base }),
    /^Hoy se cobra Releasit\.$/,
  );
});
