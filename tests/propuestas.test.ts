import { test } from "node:test";
import assert from "node:assert/strict";
import { esEstado, limpiarPropuesta } from "@/lib/propuestas";

test("una propuesta dictada se limpia y conserva la pantalla", () => {
  const r = limpiarPropuesta({
    tipo: "MEJORA",
    texto: "  que el   riesgo\n se pueda   exportar ",
    dictado: true,
    ruta: "/dashboard/control?vista=riesgo",
    seccion: "Control publicitario",
  });
  assert.ok("ok" in r);
  assert.equal(r.ok.texto, "que el riesgo se pueda exportar");
  assert.equal(r.ok.dictado, true);
  assert.equal(r.ok.ruta, "/dashboard/control?vista=riesgo");
});

test("rechaza tipo inválido, texto vacío y rutas de fuera del panel", () => {
  assert.ok("error" in limpiarPropuesta({ tipo: "OTRA", texto: "algo largo" }));
  assert.ok("error" in limpiarPropuesta({ tipo: "DUDA", texto: "  ok " }));
  const r = limpiarPropuesta({ tipo: "ERROR", texto: "no carga la tabla", ruta: "https://otro.com" });
  assert.ok("ok" in r && r.ok.ruta === null && r.ok.dictado === false);
  assert.ok(esEstado("HECHA") && !esEstado("BORRADA"));
});
