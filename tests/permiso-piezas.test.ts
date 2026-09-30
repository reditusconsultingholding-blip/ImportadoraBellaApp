// Quién puede editar cada pieza.
//
// Esta regla se rompió dos veces seguidas, y las dos en silencio: el equipo
// veía su trabajo en gris, no podía cargarlo, y no había un solo error en
// ninguna pantalla que lo explicara. La causa fue siempre la misma —el
// permiso calculado en dos lugares que se separaron— y por eso ahora vive en
// una función sola, con estas pruebas encima.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePermiso } from "@/lib/responsables";

const ANTONELLA = "usr_f3360480728cc80882ca";
const OTRA = "usr_otra_persona";
const CELIMAX = "prod_celimax";
const MELAXIN = "prod_melaxin";

test("la pieza que está a tu nombre la editás, aunque el producto no sea tuyo", () => {
  // El caso real: DR.MELAXIN SPRAY no tiene a Antonella de responsable, pero
  // las doce piezas están a su nombre. Emilia se las asignó para ese día.
  const sinProductosACargo = new Set<string>();
  assert.equal(
    decidePermiso(ANTONELLA, sinProductosACargo, { ownerId: ANTONELLA, productId: MELAXIN }),
    true,
  );
});

test("las piezas del producto que llevás las editás, sean tuyas o no", () => {
  assert.equal(
    decidePermiso(ANTONELLA, new Set([CELIMAX]), { ownerId: OTRA, productId: CELIMAX }),
    true,
  );
});

test("lo que no es tuyo ni de tu producto, no", () => {
  assert.equal(
    decidePermiso(ANTONELLA, new Set([CELIMAX]), { ownerId: OTRA, productId: MELAXIN }),
    false,
  );
});

test("una pieza sin dueño y sin producto no se le abre a nadie", () => {
  // Pasa con las que entran por la importación cuando el nombre del editor no
  // coincide con ninguna cuenta.
  assert.equal(decidePermiso(ANTONELLA, new Set([CELIMAX]), { ownerId: null, productId: null }), false);
});

test("sin dueño, pero de un producto que llevás: sí", () => {
  assert.equal(decidePermiso(ANTONELLA, new Set([CELIMAX]), { ownerId: null, productId: CELIMAX }), true);
});

test("no alcanza con que el id se parezca", () => {
  assert.equal(
    decidePermiso(ANTONELLA, new Set([CELIMAX]), { ownerId: ANTONELLA + "x", productId: MELAXIN }),
    false,
  );
});
