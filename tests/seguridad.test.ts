// Regresión de las defensas de la auditoría de seguridad.
import { test } from "node:test";
import assert from "node:assert/strict";
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
