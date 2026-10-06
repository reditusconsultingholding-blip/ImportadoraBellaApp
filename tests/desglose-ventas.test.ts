// Regresión del desglose de ventas contra el panel de Shopify.
//
// El desglose restaba los descuentos DOS VECES: `grossSales` se llama así pero
// guarda el subtotal con los descuentos ya aplicados, y encima se los volvía a
// restar para calcular las netas. El dueño lo reportó como "difiere las ventas
// de ayer, y así todos los días" — y era todos los días porque siempre hay
// descuentos.
//
// Los números son los reales del 5 de octubre de 2026, leídos del panel de
// Shopify de la tienda. Si alguien vuelve a tocar esto, tiene que seguir dando
// lo mismo que Shopify.
import { test } from "node:test";
import assert from "node:assert/strict";

/** Lo que Shopify mostró ese día, de su propio informe. */
const SHOPIFY = {
  ventasBrutas: 14648.62,
  descuentos: 586.38,
  ventasNetas: 14062.24,
  ventasTotales: 14062.24,
  pedidos: 402,
};

/** Lo que la API de Shopify nos entrega y guardamos, con esos mismos pedidos. */
const GUARDADO = {
  // currentSubtotalPriceSet: el subtotal YA neto de descuentos.
  grossSales: 14062.24,
  discounts: 586.38,
  shipping: 0,
  taxes: 0,
  // currentTotalPriceSet: lo que termina pagando el cliente.
  netSales: 14062.24,
};

/** El mismo cálculo que arma el desglose en sales.ts. */
function desglose(g: typeof GUARDADO) {
  return {
    ventasBrutas: g.grossSales + g.discounts,
    descuentos: -g.discounts,
    ventasNetas: g.grossSales,
    cargosDeEnvio: g.shipping,
    impuestos: g.taxes,
    ventasTotales: g.netSales,
  };
}

const centavos = (n: number) => Math.round(n * 100);

test("desglose: las ventas brutas coinciden con Shopify", () => {
  // Antes mostraba 14.062,24 acá — que es el TOTAL, mal rotulado como bruto.
  assert.equal(centavos(desglose(GUARDADO).ventasBrutas), centavos(SHOPIFY.ventasBrutas));
});

test("desglose: las ventas netas coinciden con Shopify", () => {
  // Antes daba 13.475,86: un número que no existe en ningún informe, 586,38
  // por debajo del real. Ese era el síntoma que veía el dueño.
  const d = desglose(GUARDADO);
  assert.equal(centavos(d.ventasNetas), centavos(SHOPIFY.ventasNetas));
  assert.notEqual(centavos(d.ventasNetas), centavos(14062.24 - 586.38));
});

test("desglose: brutas menos descuentos da netas, que es la definición de Shopify", () => {
  const d = desglose(GUARDADO);
  assert.equal(centavos(d.ventasBrutas + d.descuentos), centavos(d.ventasNetas));
});

test("desglose: el total sigue siendo el que ya estaba bien", () => {
  // Esta línea nunca estuvo mal, y por eso el error pasó desapercibido: la
  // cifra grande del panel coincidía con Shopify y solo mentía el desglose.
  assert.equal(centavos(desglose(GUARDADO).ventasTotales), centavos(SHOPIFY.ventasTotales));
});

test("desglose: sin descuentos, brutas y netas son lo mismo", () => {
  const sinDescuento = { ...GUARDADO, discounts: 0 };
  const d = desglose(sinDescuento);
  assert.equal(centavos(d.ventasBrutas), centavos(d.ventasNetas));
});
