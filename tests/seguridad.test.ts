// Regresión de las defensas de la auditoría de seguridad.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveSugerida } from "@/lib/clave-sugerida";
import { cifrar, descifrar, estaCifrado, necesitaRecifrar } from "@/lib/cifrado";
import { normalizeShopDomain, ShopifyDominioInvalido } from "@/lib/integrations/shopify";
import { urlSegura } from "@/lib/url-segura";
import { contar, ipDe } from "@/lib/limite";
import { sinSecretos } from "@/lib/http";

process.env.SESSION_SECRET ??= "secreto-de-prueba";

test("cifrado: ida y vuelta, IV distinto cada vez", () => {
  const a = cifrar("ntn_token_secreto")!;
  const b = cifrar("ntn_token_secreto")!;
  assert.ok(estaCifrado(a));
  assert.notEqual(a, b);
  assert.equal(descifrar(a), "ntn_token_secreto");
});

test("cifrado: un valor alterado en la base falla, no devuelve basura", () => {
  const c = cifrar("x")!;
  assert.throws(() => descifrar(c.slice(0, -2) + (c.endsWith("A") ? "BB" : "AA")));
});

test("cifrado: texto plano viejo se lee tal cual y se marca para recifrar", () => {
  assert.equal(descifrar("token-viejo"), "token-viejo");
  assert.equal(necesitaRecifrar("token-viejo"), true);
  assert.equal(cifrar(null), null);
  assert.equal(cifrar(""), "");
});

test("Shopify: solo *.myshopify.com (SSRF)", () => {
  assert.equal(normalizeShopDomain(" https://Mi-Tienda.myshopify.com/admin "), "mi-tienda.myshopify.com");
  for (const malo of ["evil.com", "169.254.169.254", "x.myshopify.com.evil.com", "localhost:3000", "a.myshopify.com@evil.com"]) {
    assert.throws(() => normalizeShopDomain(malo), ShopifyDominioInvalido, malo);
  }
});

test("enlaces del equipo: solo http/https", () => {
  assert.equal(urlSegura("javascript:alert(1)"), "#");
  assert.equal(urlSegura("data:text/html,<script>"), "#");
  assert.equal(urlSegura("https://drive.google.com/x"), "https://drive.google.com/x");
  assert.equal(urlSegura("drive.google.com/x"), "https://drive.google.com/x");
});

test("IP real: la última de X-Forwarded-For (la que agrega el proxy)", () => {
  const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 9.9.9.9" } });
  assert.equal(ipDe(req), "9.9.9.9");
});

test("límite de frecuencia: corta después del máximo", () => {
  const clave = `prueba-${Math.random()}`;
  for (let i = 0; i < 3; i++) assert.equal(contar(clave, 3, 60_000).ok, true);
  assert.equal(contar(clave, 3, 60_000).ok, false);
});

test("los errores no arrastran la api_key", () => {
  assert.equal(sinSecretos("GET /facebook?api_key=abc123&fields=x"), "GET /facebook?api_key=***&fields=x");
});

// ---------------------------------------------------------------------------
// La contraseña que la app propone al dar de alta a alguien.

test("la clave sugerida no repite ni usa caracteres que se confunden", () => {
  const vistas = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const c = claveSugerida();
    // Cuatro grupos de seis, separados por guiones: se puede dictar.
    assert.match(c, /^[A-Za-z0-9]{6}(-[A-Za-z0-9]{6}){3}$/, c);
    // Nada de l, I, O, 0 ni 1: son los pares que se confunden al leerla de una
    // pantalla o al dictarla por teléfono.
    assert.ok(!/[lIO01]/.test(c), `tiene un carácter ambiguo: ${c}`);
    assert.ok(!vistas.has(c), "se repitió una clave");
    vistas.add(c);
  }
  assert.equal(vistas.size, 200);
});

test("la clave sugerida usa todo el alfabeto, no un rincón", () => {
  // Con sesgo en el azar —el error clásico de `% tope` sobre un byte— las
  // primeras letras del alfabeto salen más seguido. Sobre 400 claves de 24
  // caracteres son casi 10.000 tiradas: si el reparto fuera parejo cada una de
  // las 56 letras aparece unas 170 veces. Se exige que ninguna quede por
  // debajo de la mitad de eso, que es holgado para el azar y estrecho para un
  // sesgo real.
  const cuenta = new Map<string, number>();
  for (let i = 0; i < 400; i++) {
    for (const ch of claveSugerida().replace(/-/g, "")) {
      cuenta.set(ch, (cuenta.get(ch) ?? 0) + 1);
    }
  }
  const total = [...cuenta.values()].reduce((a, b) => a + b, 0);
  const esperado = total / cuenta.size;
  for (const [ch, n] of cuenta) {
    assert.ok(n > esperado / 2, `la letra ${ch} sale muy poco: ${n} contra ${Math.round(esperado)}`);
  }
  // Y que estén casi todas: 56 posibles, se aceptan 50 por el azar.
  assert.ok(cuenta.size >= 50, `solo salieron ${cuenta.size} caracteres distintos`);
});
