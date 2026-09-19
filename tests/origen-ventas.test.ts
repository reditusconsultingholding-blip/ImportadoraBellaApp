// Regresión de la clasificación de origen de las ventas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarOrigen } from "@/lib/origen-ventas";

const base = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  referrerUrl: null,
  origenFuente: null,
  origenTipo: null,
  atribucionAl: new Date("2026-09-19T12:00:00Z"),
};

test("la pauta se reconoce por el utm, venga como venga escrito", () => {
  assert.equal(clasificarOrigen({ ...base, utmSource: "facebook" }).categoria, "Meta");
  assert.equal(clasificarOrigen({ ...base, utmSource: "IG" }).categoria, "Meta");
  assert.equal(clasificarOrigen({ ...base, utmSource: "tiktok" }).categoria, "TikTok");
  assert.equal(clasificarOrigen({ ...base, utmCampaign: "134142 / TE GINSENG / TikTok" }).categoria, "TikTok");
});

test("también por el sitio que refirió la visita", () => {
  assert.equal(clasificarOrigen({ ...base, referrerUrl: "https://l.instagram.com/x" }).categoria, "Meta");
  assert.equal(clasificarOrigen({ ...base, referrerUrl: "https://www.google.com/" }).categoria, "Google");
  assert.equal(clasificarOrigen({ ...base, referrerUrl: "https://api.whatsapp.com/send" }).categoria, "WhatsApp");
  assert.equal(clasificarOrigen({ ...base, origenFuente: "kwai" }).categoria, "Otra red social");
});

test("sin ninguna pista es tráfico directo: alguien que ya tenía el link", () => {
  assert.equal(clasificarOrigen(base).categoria, "Directo o link compartido");
  assert.equal(clasificarOrigen({ ...base, origenFuente: "direct" }).categoria, "Directo o link compartido");
  assert.equal(clasificarOrigen({ ...base, origenTipo: "unknown" }).categoria, "Directo o link compartido");
});

test("sin recorrido guardado NO se inventa un origen", () => {
  assert.equal(clasificarOrigen({ ...base, atribucionAl: null }).categoria, "Sin dato");
});

test("una fuente desconocida se muestra tal cual, no se fuerza a una categoría", () => {
  const r = clasificarOrigen({ ...base, utmSource: "revista-online" });
  assert.equal(r.categoria, "Otra fuente");
  assert.equal(r.pista, "revista-online");
});

test("la pista devuelta es la que disparó la regla, para poder auditarla", () => {
  assert.equal(clasificarOrigen({ ...base, referrerUrl: "https://m.facebook.com/" }).pista, "https://m.facebook.com/");
});
