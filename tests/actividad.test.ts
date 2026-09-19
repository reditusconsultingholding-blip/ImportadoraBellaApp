// Regresión del seguimiento de actividad, de la memoria compartida y de los
// mensajes de error seguros.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describirActividad, describirNavegador } from "@/lib/actividad-texto";
import { invalidarMemoria, memorizar } from "@/lib/memoria";
import { mensajeSeguro } from "@/lib/respuesta";

test("seguimiento: una pantalla con filtros se lee en castellano", () => {
  const d = describirActividad({ tipo: "vista", ruta: "/dashboard/control?vista=economia&periodo=mes-2026-7", detalle: null });
  assert.equal(d.titulo, "Abrió Control publicitario › Economía por producto");
  assert.equal(d.detalle, "julio 2026");
});

test("seguimiento: acciones según método y endpoint", () => {
  assert.equal(describirActividad({ tipo: "accion", ruta: "/api/requirements", detalle: "POST" }).titulo, "Creó una pieza");
  assert.equal(describirActividad({ tipo: "accion", ruta: "/api/requirements/abc", detalle: "PATCH" }).titulo, "Editó una pieza");
  assert.equal(describirActividad({ tipo: "accion", ruta: "/api/requirements/abc", detalle: "DELETE" }).titulo, "Eliminó una pieza");
  assert.equal(describirActividad({ tipo: "accion", ruta: "/api/users/xyz", detalle: "DELETE" }).titulo, "Eliminó un usuario");
  // Un endpoint desconocido no se pierde: se describe igual.
  assert.match(describirActividad({ tipo: "accion", ruta: "/api/algo-nuevo", detalle: "PUT" }).titulo, /^Editó algo en algo-nuevo/);
});

test("seguimiento: descargas, búsquedas y accesos", () => {
  assert.equal(describirActividad({ tipo: "descarga", ruta: "/api/clientes/csv?rango=30d", detalle: null }).titulo, "Descargó la lista de clientes (CSV)");
  assert.equal(describirActividad({ tipo: "busqueda", ruta: "/dashboard/productos", detalle: "faja" }).titulo, "Buscó «faja»");
  assert.equal(describirActividad({ tipo: "login_fallido", ruta: "/login", detalle: "Clave incorrecta" }).titulo, "Intento de entrada fallido");
  assert.equal(describirNavegador("Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/140 Safari/537"), "Chrome en Windows");
});

test("memoria: comparte el cálculo y se invalida con una escritura", async () => {
  let llamadas = 0;
  const f = memorizar("prueba", async (n: number) => {
    llamadas++;
    return { valor: n * 2, lista: [1, 2, 3] };
  });
  const a = await f(2);
  const b = await f(2);
  assert.equal(llamadas, 1);
  // Cada lectura recibe su copia: modificar una no toca la otra.
  a.lista.push(99);
  assert.deepEqual(b.lista, [1, 2, 3]);
  invalidarMemoria();
  await f(2);
  assert.equal(llamadas, 2);
});

test("memoria: dos pedidos simultáneos comparten un solo cálculo", async () => {
  let llamadas = 0;
  const f = memorizar("prueba-simultanea", async () => {
    llamadas++;
    await new Promise((r) => setTimeout(r, 20));
    return 1;
  });
  await Promise.all([f(), f(), f()]);
  assert.equal(llamadas, 1);
});

test("memoria: si hubo una escritura durante el cálculo, no se guarda", async () => {
  let llamadas = 0;
  const f = memorizar("prueba-carrera", async () => {
    llamadas++;
    invalidarMemoria(); // alguien escribió mientras se calculaba
    return llamadas;
  });
  await f();
  await f();
  assert.equal(llamadas, 2);
});

test("errores: los propios se muestran, los de la base no", () => {
  assert.equal(mensajeSeguro(new Error("Ese dominio no es de Shopify.")), "Ese dominio no es de Shopify.");
  const prisma = Object.assign(new Error("Invalid `prisma.user.findMany()` invocation: column X"), { name: "PrismaClientKnownRequestError" });
  const orig = console.error;
  console.error = () => {};
  try {
    assert.match(mensajeSeguro(prisma), /Ocurrió un error inesperado/);
    assert.match(mensajeSeguro("texto suelto"), /Ocurrió un error inesperado/);
  } finally {
    console.error = orig;
  }
});
