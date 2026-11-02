import test from "node:test";
import assert from "node:assert/strict";
import { tocaPrecalentar, PRECALENTAR_PANEL_CADA_MS, PRECALENTAR_TODO_CADA_MS } from "../src/lib/precalentar-ritmo";

test("la primera vuelta después de arrancar siempre precalienta", () => {
  assert.equal(tocaPrecalentar(undefined, 1000, PRECALENTAR_PANEL_CADA_MS), true);
});

test("no vuelve a precalentar antes de tiempo", () => {
  assert.equal(tocaPrecalentar(0, PRECALENTAR_PANEL_CADA_MS - 1, PRECALENTAR_PANEL_CADA_MS), false);
  assert.equal(tocaPrecalentar(0, PRECALENTAR_TODO_CADA_MS - 1, PRECALENTAR_TODO_CADA_MS), false);
});

test("precalienta justo al cumplirse el plazo", () => {
  assert.equal(tocaPrecalentar(0, PRECALENTAR_PANEL_CADA_MS, PRECALENTAR_PANEL_CADA_MS), true);
  assert.equal(tocaPrecalentar(0, PRECALENTAR_TODO_CADA_MS, PRECALENTAR_TODO_CADA_MS), true);
});
