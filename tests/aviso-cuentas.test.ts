// Lo que el aviso de cuentas sin datos LE DICE al equipo.
//
// Se renderiza de verdad, con React, en vez de revisar el archivo a ojo: lo
// que importa de este componente es el texto —qué número no hay que creer y
// qué hacer—, y un texto se rompe de maneras que la compilación no ve: un
// «undefined» donde iba la fecha, un «$NaN» donde iba el gasto, una rama que
// deja de dibujarse. Eso pasó en octubre con otra tarjeta: la fecha salía un
// día antes porque `new Date("2026-10-21")` es medianoche UTC y en Ecuador cae
// el 20.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TarjetaCuenta, type CuentaAvisada } from "@/app/dashboard/aviso-cuentas-sin-datos";

const CP3: CuentaAvisada = {
  id: "a",
  nombre: "CP3 - Top Ventas",
  platform: "META" as const,
  externalId: "1507602524109494",
  ultimoDia: "2026-10-21",
  diasSinDatos: 8,
  callada: true,
  ciega: false,
  gasto7d: 0,
  gastoDiarioPrevio: 28.4,
};

const CP2: CuentaAvisada = {
  id: "b",
  nombre: "CP2 - Top Ventas",
  platform: "META" as const,
  externalId: "1324323739642379",
  ultimoDia: "2026-10-29",
  diasSinDatos: 0,
  callada: false,
  ciega: true,
  gasto7d: 1544,
  gastoDiarioPrevio: 217,
};

const pintar = ({
  cuentas,
  verCifras,
  puedeMarcar,
}: {
  cuentas: CuentaAvisada[];
  verCifras: boolean;
  puedeMarcar: boolean;
}) =>
  cuentas
    .map((cuenta) =>
      renderToStaticMarkup(
        React.createElement(TarjetaCuenta, {
          cuenta,
          tipo: cuenta.ciega ? ("sin-compras" as const) : ("sin-datos" as const),
          verCifras,
          puedeMarcar,
          alGuardar: () => {},
        }),
      ),
    )
    .join("");

test("el aviso nombra la cuenta, la fecha en palabras y los días", () => {
  const html = pintar({ cuentas: [CP3], verCifras: true, puedeMarcar: true });
  assert.ok(html.includes("CP3 - Top Ventas"));
  // La fecha, armada a mano: si se usara `new Date(dia)` diría «20 de octubre».
  assert.ok(html.includes("21 de octubre"), html);
  assert.ok(html.includes("8 días"), html);
});

test("el aviso dice que el CPA de abajo está mejor de lo que es", () => {
  // Es la única frase que de verdad hace falta: el daño no es quedarse sin un
  // dato, es decidir con un número optimista creyéndolo exacto.
  const html = pintar({ cuentas: [CP3], verCifras: true, puedeMarcar: true });
  assert.ok(html.includes("mejores que los reales"), html);
  // Y no promete que el gasto de hoy sea el que se midió: lo que la cuenta
  // gaste desde que se calló no se puede saber desde el panel.
  assert.ok(html.includes("alcanzó a ver"), html);
  assert.ok(html.includes("administrador de anuncios"), html);
});

test("sin permiso de cifras el problema se dice, el dinero no", () => {
  const html = pintar({ cuentas: [CP3, CP2], verCifras: false, puedeMarcar: false });
  assert.ok(html.includes("CP3 - Top Ventas"));
  assert.ok(!html.includes("$"), "no debería aparecer una cifra de dinero");
});

test("los pasos para arreglarlo van adentro del aviso", () => {
  // Un aviso que dice «revisá la conexión en Windsor» obliga a buscar a
  // alguien que sepa cómo, y eso es un día perdido por vez.
  const html = pintar({ cuentas: [CP3], verCifras: true, puedeMarcar: true });
  assert.ok(html.includes("windsor.ai"), html);
  assert.ok(html.includes("1507602524109494"), "los pasos llevan el número de la cuenta");
});

test("quien no administra conexiones ve el aviso pero no el botón de callarlo", () => {
  const conBoton = pintar({ cuentas: [CP3], verCifras: true, puedeMarcar: true });
  const sinBoton = pintar({ cuentas: [CP3], verCifras: true, puedeMarcar: false });
  assert.ok(conBoton.includes("apagada a propósito"));
  assert.ok(!sinBoton.includes("apagada a propósito"));
  assert.ok(sinBoton.includes("CP3 - Top Ventas"), "el aviso sí lo ve");
});

test("la cuenta que gasta sin registrar compras no se confunde con la caída", () => {
  const html = pintar({ cuentas: [CP2], verCifras: true, puedeMarcar: true });
  assert.ok(html.includes("no registra ninguna compra"), html);
  assert.ok(html.includes("peor del que es"), "acá el CPA sale peor, no mejor");
  assert.ok(html.includes("WhatsApp"), "hay que decir la explicación que no es una falla");
  // Y no le ofrece los pasos de Windsor, que no arreglan esto.
  assert.ok(!html.includes("windsor.ai"), html);
});

test("el texto no tiene huecos: ni undefined, ni NaN, ni objetos", () => {
  const todo = [
    pintar({ cuentas: [CP3, CP2], verCifras: true, puedeMarcar: true }),
    pintar({ cuentas: [CP3, CP2], verCifras: false, puedeMarcar: false }),
    // Una cuenta de la que no se pudo medir nada: el caso que rompe textos.
    pintar({
      cuentas: [{ ...CP3, ultimoDia: null, diasSinDatos: null, gastoDiarioPrevio: null }],
      verCifras: true,
      puedeMarcar: true,
    }),
  ].join("");
  assert.ok(!/undefined|NaN|\[object/.test(todo), "quedó un hueco en el texto");
});

test("la cuenta caida abre los pasos sola; la que no registra compras, no", () => {
  // El caso grave no espera que alguien pida los pasos: es raro, es caro y
  // nadie los sabe de memoria. El ambar si espera, porque convive dias.
  const caida = renderToStaticMarkup(
    React.createElement(TarjetaCuenta, {
      cuenta: CP3,
      tipo: "sin-datos" as const,
      verCifras: true,
      puedeMarcar: true,
      alGuardar: () => {},
    }),
  );
  const sinCompras = renderToStaticMarkup(
    React.createElement(TarjetaCuenta, {
      cuenta: CP2,
      tipo: "sin-compras" as const,
      verCifras: true,
      puedeMarcar: true,
      alGuardar: () => {},
    }),
  );
  assert.ok(caida.includes("windsor.ai"), "los pasos tienen que venir abiertos");
  assert.ok(caida.includes("Ocultar los pasos"), "y poder cerrarse");
  assert.ok(!sinCompras.includes("Administrador de eventos"), "este arranca cerrado");
  assert.ok(sinCompras.includes("paso a paso"), "pero ofrece abrirlos");
});
