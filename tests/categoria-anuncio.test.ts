import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriaDeAnuncio } from "../src/lib/categoria-anuncio";

// El ángulo vive en el nombre del conjunto de anuncios: "nosotros manejamos
// los ángulos a nivel de conjunto de anuncios", dijo Fabricio. El formato, en
// el del anuncio.
test("lee el ángulo del conjunto y el formato del anuncio", () => {
  const c = categoriaDeAnuncio({
    campana: "177118 / GOTAS DRENAJE / ESCALA",
    conjunto: "ad set 1 - angulo cansancio",
    anuncio: "AD 03 antes y despues ugc",
  });
  assert.equal(c.angulo, "Frustración acumulada");
  assert.equal(c.desde, "conjunto");
  assert.equal(c.formato, "Antes / Después");
});

// El conjunto manda sobre la campaña: es más específico.
test("el conjunto le gana a la campaña", () => {
  const c = categoriaDeAnuncio({
    campana: "PROMO precio especial",
    conjunto: "testimonio real",
    anuncio: "v2",
  });
  assert.equal(c.angulo, "Testimonial real");
  assert.equal(c.desde, "conjunto");
});

// Los ángulos propios del producto —"sin olor a batana"— ganan sobre los de la
// lista general: los escribió el equipo para ESTE producto.
test("los ángulos propios del producto van primero", () => {
  const c = categoriaDeAnuncio(
    { conjunto: "sin olor a batana", anuncio: "x" },
    ["sin olor a batana"],
  );
  assert.equal(c.angulo, "sin olor a batana");
});

// Lo importante: no inventa. Un nombre sin nomenclatura devuelve null, y en
// pantalla eso sale como "sin clasificar" — que es información, no un hueco.
test("no adivina cuando el nombre no dice nada", () => {
  const c = categoriaDeAnuncio({
    campana: "Campaña 7",
    conjunto: "Conjunto de anuncios 2",
    anuncio: "copia de copia",
  });
  assert.equal(c.angulo, null);
  assert.equal(c.formato, null);
  assert.equal(c.desde, null);
});

// Las pistas cortas no pueden comerse a las largas: "ad" está dentro de
// "antes y despues" y de medio catálogo.
test("una pista larga le gana a una corta", () => {
  const c = categoriaDeAnuncio({ anuncio: "AD antes y despues 2" });
  assert.equal(c.formato, "Antes / Después");
});

test("aguanta nombres vacíos sin romperse", () => {
  const c = categoriaDeAnuncio({});
  assert.deepEqual(c, { angulo: null, formato: null, desde: null });
});
