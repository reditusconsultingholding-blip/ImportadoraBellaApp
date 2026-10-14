// Regresión del calendario del resumen de progreso (15 y fin de mes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { erroresDelResumen } from "@/lib/scheduler";
import { periodoAnterior, periodoQueCierra } from "@/lib/progreso-quincenal";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

test("el 15 cierra la primera quincena", () => {
  const p = periodoQueCierra(d("2026-09-15"))!;
  assert.equal(iso(p.desde), "2026-09-01");
  assert.equal(iso(p.hasta), "2026-09-15");
  assert.equal(p.texto, "1 al 15 de septiembre");
});

test("el último día cierra la segunda quincena (30, 31 y febrero)", () => {
  assert.equal(periodoQueCierra(d("2026-09-30"))!.texto, "16 al 30 de septiembre");
  assert.equal(periodoQueCierra(d("2026-10-31"))!.texto, "16 al 31 de octubre");
  assert.equal(periodoQueCierra(d("2027-02-28"))!.texto, "16 al 28 de febrero");
  assert.equal(periodoQueCierra(d("2026-09-29")), null);
  assert.equal(periodoQueCierra(d("2026-10-30")), null);
});

test("un día cualquiera no manda nada", () => {
  assert.equal(periodoQueCierra(d("2026-09-19")), null);
});

test("la comparación es contra la quincena anterior, cruzando mes y año", () => {
  const a = periodoAnterior(periodoQueCierra(d("2026-09-30"))!);
  assert.deepEqual([iso(a.desde), iso(a.hasta)], ["2026-09-01", "2026-09-15"]);
  const b = periodoAnterior(periodoQueCierra(d("2026-09-15"))!);
  assert.deepEqual([iso(b.desde), iso(b.hasta)], ["2026-08-16", "2026-08-31"]);
  const c = periodoAnterior(periodoQueCierra(d("2027-01-15"))!);
  assert.deepEqual([iso(c.desde), iso(c.hasta)], ["2026-12-16", "2026-12-31"]);
});

// ---------------------------------------------------------------------------
// Qué deja una vuelta del reloj marcada en rojo.

test("una parte que dice «error:» pinta la vuelta de rojo", () => {
  const r = erroresDelResumen({
    facebook: "41 campañas, 0 días cambiados",
    correo: "error: Falta la clave de Resend",
  });
  assert.ok(r, "tendría que haber marcado error");
  assert.match(r, /correo/);
  assert.match(r, /Falta la clave de Resend/);
  // El prefijo «error:» no se repite dentro del mensaje: ya lo dice el estado.
  assert.ok(!/error:/i.test(r), `arrastró el prefijo: ${r}`);
});

test("una vuelta sana no se marca", () => {
  assert.equal(
    erroresDelResumen({
      facebook: "41 campañas, 0 días cambiados",
      shopify: "790 órdenes",
    }),
    null,
  );
});

test("la palabra error dentro de una frase no cuenta", () => {
  // «sin errores» y «0 errores» son buenas noticias; solo cuenta cuando el
  // texto EMPIEZA diciendo que falló, que es como lo escriben las partes.
  assert.equal(erroresDelResumen({ notion: "316 actividades, sin errores" }), null);
  assert.equal(erroresDelResumen({ cierres: "248 filas, 0 errores" }), null);
});
