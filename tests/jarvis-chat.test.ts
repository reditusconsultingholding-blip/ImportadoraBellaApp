// Regresión de las dos piezas sutiles del chat de Jarvis: partir la respuesta
// en frases para leerla en voz alta mientras se escribe, y qué capturas se
// aceptan.
import { test } from "node:test";
import assert from "node:assert/strict";
import { finDeFraseCerrada } from "@/lib/frases";
import { revisarImagenes, MAX_BASE64, MAX_IMAGENES } from "@/lib/imagenes-chat";

test("frases: no parte un número decimal", () => {
  // El caso que motivó la condición del espacio. Si partiera acá, la voz diría
  // "el CPA de NIDA es siete punto" y se callaría a mitad de la cifra.
  assert.equal(finDeFraseCerrada("El CPA de NIDA es 7.40"), -1);
  assert.equal(finDeFraseCerrada("Gastaste $1.065 en TikTok"), -1);
  assert.equal(finDeFraseCerrada("Vendés 3.5 veces lo que gastás"), -1);
});

test("frases: corta al final de una oración de verdad", () => {
  const t = "Vendimos 48 mil. Falta poco.";
  // Devuelve la posición siguiente al último punto cerrado: el texto entero.
  assert.equal(finDeFraseCerrada(t), t.length);
  assert.equal(finDeFraseCerrada("Vendimos 48 mil. Falta"), 16);
});

test("frases: una oración a medio escribir todavía no se lee", () => {
  assert.equal(finDeFraseCerrada("Mirando la rentabilidad de"), -1);
  assert.equal(finDeFraseCerrada(""), -1);
});

test("frases: con un número decimal adentro corta en el punto bueno", () => {
  // Lo que llega de verdad por el flujo: una frase con cifras y después otra.
  const t = "El CPA es 7.40 y el equilibrio 11.20. Te sobra margen";
  assert.equal(finDeFraseCerrada(t), 37);
  assert.equal(t.slice(0, 37), "El CPA es 7.40 y el equilibrio 11.20.");
});

test("frases: los saltos de línea y los dos puntos también cierran", () => {
  assert.equal(finDeFraseCerrada("Tres cosas:\n"), 12);
  assert.equal(finDeFraseCerrada("Pará\nmirá esto"), 5);
});

test("imágenes: un mensaje sin capturas pasa derecho", () => {
  assert.equal(revisarImagenes([{}]), null);
  assert.equal(revisarImagenes([{ imagenes: [] }]), null);
});

test("imágenes: acepta los cuatro tipos y rechaza el resto", () => {
  const ok = (t: string) => revisarImagenes([{ imagenes: [{ media_type: t, data: "abc" }] }]);
  assert.equal(ok("image/png"), null);
  assert.equal(ok("image/jpeg"), null);
  assert.equal(ok("image/webp"), null);
  assert.equal(ok("image/gif"), null);
  // Un PDF renombrado a .png llega con su tipo real y se rechaza acá, no con un
  // 400 en inglés de la API.
  assert.match(String(ok("application/pdf")), /PNG, JPG, WEBP o GIF/);
  assert.match(String(ok("image/heic")), /PNG, JPG, WEBP o GIF/);
});

test("imágenes: tope de cantidad y de peso", () => {
  const una = { media_type: "image/png", data: "x" };
  assert.equal(revisarImagenes([{ imagenes: Array(MAX_IMAGENES).fill(una) }]), null);
  assert.match(
    String(revisarImagenes([{ imagenes: Array(MAX_IMAGENES + 1).fill(una) }])),
    /Máximo 4 imágenes/
  );
  assert.match(
    String(revisarImagenes([{ imagenes: [{ media_type: "image/png", data: "x".repeat(MAX_BASE64 + 1) }] }])),
    /pesa demasiado/
  );
});

test("imágenes: lo que llega mal armado no pasa por error", () => {
  // Sin esto, un `data` numérico o ausente viaja a la API y vuelve un 400.
  assert.match(String(revisarImagenes([{ imagenes: [{ media_type: "image/png" }] }])), /llegaron mal/);
  assert.match(String(revisarImagenes([{ imagenes: [{ data: "abc" }] }])), /llegaron mal/);
  assert.match(
    String(revisarImagenes([{ imagenes: "no es un arreglo" as unknown as [] }])),
    /llegaron mal/
  );
});

test("imágenes: revisa TODOS los turnos, no solo el último", () => {
  // El historial llega entero del navegador: una captura inválida metida en un
  // turno viejo tiene que frenar igual.
  const malo = [
    { imagenes: [{ media_type: "image/png", data: "ok" }] },
    {},
    { imagenes: [{ media_type: "text/html", data: "ok" }] },
  ];
  assert.match(String(revisarImagenes(malo)), /PNG, JPG, WEBP o GIF/);
});
