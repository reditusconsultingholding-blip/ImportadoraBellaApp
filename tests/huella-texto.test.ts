// La huella que ata cada grabación al texto con el que se hizo.
//
// Si esto se rompe, la capacitación puede quedar diciendo en voz alta algo
// distinto de lo que muestra en pantalla, y nadie se entera.
import { test } from "node:test";
import assert from "node:assert/strict";
import { huellaDeTexto } from "@/lib/huella-texto";

test("huella: el mismo texto da siempre lo mismo", () => {
  const t = "Bienvenido al panel de Importadora Bella.";
  assert.equal(huellaDeTexto(t), huellaDeTexto(t));
  // Fija a propósito: si alguien cambia la fórmula, TODAS las grabaciones
  // dejarían de coincidir en silencio y la capacitación entera caería a la voz
  // del navegador sin que nadie sepa por qué. Este número lo hace ruidoso.
  assert.equal(huellaDeTexto(t), "61506bfe");
});

test("huella: cambiar una coma cambia la huella", () => {
  const antes = "Los responsables ven y editan todas las piezas del producto.";
  const despues = "Los responsables ven y editan todas las piezas de ese producto.";
  assert.notEqual(huellaDeTexto(antes), huellaDeTexto(despues));
});

test("huella: es de largo fijo y hexadecimal", () => {
  for (const t of ["", "a", "una frase bastante más larga con acentos: ñ, á, é", "🙂"]) {
    const h = huellaDeTexto(t);
    assert.match(h, /^[0-9a-f]{8}$/, `huella rara para ${JSON.stringify(t)}`);
  }
});
