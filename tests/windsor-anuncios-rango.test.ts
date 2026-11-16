import test from "node:test";
import assert from "node:assert/strict";
import { rangoDeAnuncios } from "../src/lib/integrations/windsor-anuncios";

test("anuncios: un mes la primera vez, la semana después, tres días si la anterior se venció", () => {
  assert.equal(rangoDeAnuncios(false, false), "last_30dT");
  assert.equal(rangoDeAnuncios(false, true), "last_30dT");
  assert.equal(rangoDeAnuncios(true, false), "last_7dT");
  assert.equal(rangoDeAnuncios(true, true), "last_3dT");
});
