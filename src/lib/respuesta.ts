import { gzipSync } from "node:zlib";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

// Respuestas JSON comprimidas.
//
// Next comprime las páginas, pero NO las respuestas de las rutas de API: las
// piezas de Requerimientos viajaban como 5,6 MB de JSON crudo, que con gzip
// son 300 KB (18 veces menos). En un celular con datos móviles es la
// diferencia entre ver la tabla al instante o esperar varios segundos.
//
// Se comprime solo si el navegador lo acepta (todos lo hacen) y si vale la
// pena (más de 2 KB). gzip nivel 6: el punto de equilibrio entre tamaño y
// tiempo de CPU; 5,6 MB tardan unos 40 ms.

const MINIMO = 2048;

// Son datos del negocio de alguien con sesión: el navegador no los guarda
// (una computadora compartida no tiene que poder mostrarlos después).
function sinCache(init?: ResponseInit) {
  const h = new Headers(init?.headers);
  if (!h.has("Cache-Control")) h.set("Cache-Control", "private, no-store");
  return h;
}

async function aceptaGzip() {
  try {
    return ((await headers()).get("accept-encoding") ?? "").includes("gzip");
  } catch {
    return false;
  }
}

function comprimida(cuerpo: string, tipo: string, init?: ResponseInit) {
  const h = sinCache(init);
  h.set("Content-Type", tipo);
  h.set("Content-Encoding", "gzip");
  h.set("Vary", "Accept-Encoding");
  return new NextResponse(gzipSync(cuerpo, { level: 6 }), { status: init?.status ?? 200, headers: h });
}

/** Como NextResponse.json, pero comprimida cuando conviene. */
export async function jsonComprimido(datos: unknown, init?: ResponseInit) {
  const cuerpo = JSON.stringify(datos);
  if (cuerpo.length < MINIMO || !(await aceptaGzip())) return NextResponse.json(datos, { ...init, headers: sinCache(init) });
  return comprimida(cuerpo, "application/json", init);
}

/** Para texto (CSV): mismo criterio. */
export async function textoComprimido(cuerpo: string, tipo: string, init?: ResponseInit) {
  if (cuerpo.length < MINIMO || !(await aceptaGzip())) {
    const h = new Headers(init?.headers);
    h.set("Content-Type", tipo);
    return new NextResponse(cuerpo, { status: init?.status ?? 200, headers: h });
  }
  return comprimida(cuerpo, tipo, init);
}

/**
 * El texto de un error, apto para mostrarle a quien usa la app.
 *
 * Los mensajes propios ("ese dominio no es de Shopify", "Windsor respondió
 * 401") se muestran tal cual: explican qué hacer. Los de la base (Prisma) y
 * los de Node no: pueden traer nombres de tablas, columnas o pedazos de la
 * consulta. Esos se registran en el log del servidor y a la pantalla llega un
 * mensaje genérico.
 */
export function mensajeSeguro(err: unknown, generico = "Ocurrió un error inesperado. Prueba de nuevo en un momento.") {
  const e = err as { name?: string; message?: string; code?: unknown } | null;
  const interno =
    !e ||
    typeof e.message !== "string" ||
    /^PrismaClient|^Prisma/.test(e.name ?? "") ||
    /prisma|invocation|SELECT |INSERT |UPDATE |DELETE |ECONN|ETIMEDOUT|ENOTFOUND/i.test(e.message);
  if (interno) {
    console.error("[error interno]", err);
    return generico;
  }
  return e.message as string;
}
