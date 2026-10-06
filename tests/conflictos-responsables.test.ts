// Regresión de la huella de un choque entre Notion y Jarvis.
//
// Es lo que decide si una pasada abre una pregunta nueva o toca una que ya
// está. La sincronización corre cada diez minutos: si la huella no fuera
// estable, dirección recibiría el mismo aviso 144 veces por día y dejaría de
// mirar las notificaciones — que es exactamente lo contrario de lo que se
// quiere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDe } from "@/lib/conflictos-responsables";

test("choques: la misma situación da la misma huella en dos pasadas", () => {
  const a = claveDe({ tipo: "sobra_en_jarvis", productId: "p1", userId: "u1" });
  const b = claveDe({ tipo: "sobra_en_jarvis", productId: "p1", userId: "u1" });
  assert.equal(a, b);
});

test("choques: distinto producto o distinta persona son preguntas distintas", () => {
  const base = claveDe({ tipo: "sobra_en_jarvis", productId: "p1", userId: "u1" });
  assert.notEqual(base, claveDe({ tipo: "sobra_en_jarvis", productId: "p2", userId: "u1" }));
  assert.notEqual(base, claveDe({ tipo: "sobra_en_jarvis", productId: "p1", userId: "u2" }));
});

test("choques: el nombre de Notion se normaliza", () => {
  // "ANITA", "Anita" y "anita  " son el mismo problema escrito de tres formas.
  // Sin normalizar, cada arreglo cosmético en la planilla abriría un choque
  // nuevo y volvería a avisar.
  const esperada = claveDe({ tipo: "sin_cruzar", productId: "p1", nombreEnNotion: "ANITA" });
  for (const escrito of ["Anita", "anita", "  ANITA  ", "ANITA"]) {
    assert.equal(claveDe({ tipo: "sin_cruzar", productId: "p1", nombreEnNotion: escrito }), esperada);
  }
  // Los espacios de más adentro también: "ANA  CAICEDO" es "ANA CAICEDO".
  assert.equal(
    claveDe({ tipo: "sin_cruzar", productId: "p1", nombreEnNotion: "ANA  CAICEDO" }),
    claveDe({ tipo: "sin_cruzar", productId: "p1", nombreEnNotion: "ana caicedo" }),
  );
});

test("choques: dos nombres distintos sí son dos preguntas", () => {
  assert.notEqual(
    claveDe({ tipo: "sin_cruzar", productId: "p1", nombreEnNotion: "ANITA" }),
    claveDe({ tipo: "sin_cruzar", productId: "p1", nombreEnNotion: "MARIA" }),
  );
});

test("choques: los dos tipos no se pisan entre sí", () => {
  // Sin el prefijo del tipo, un producto con un usuario "ANITA" y un nombre de
  // Notion "ANITA" podrían colisionar y una pregunta taparía a la otra.
  assert.notEqual(
    claveDe({ tipo: "sobra_en_jarvis", productId: "p1", userId: "ANITA" }),
    claveDe({ tipo: "sin_cruzar", productId: "p1", nombreEnNotion: "ANITA" }),
  );
});
