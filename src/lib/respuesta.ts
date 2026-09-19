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

async function aceptaGzip() {
  try {
    return ((await headers()).get("accept-encoding") ?? "").includes("gzip");
  } catch {
    return false;
  }
}

function comprimida(cuerpo: string, tipo: string, init?: ResponseInit) {
  const h = new Headers(init?.headers);
  h.set("Content-Type", tipo);
  h.set("Content-Encoding", "gzip");
  h.set("Vary", "Accept-Encoding");
  return new NextResponse(gzipSync(cuerpo, { level: 6 }), { status: init?.status ?? 200, headers: h });
}

/** Como NextResponse.json, pero comprimida cuando conviene. */
export async function jsonComprimido(datos: unknown, init?: ResponseInit) {
  const cuerpo = JSON.stringify(datos);
  if (cuerpo.length < MINIMO || !(await aceptaGzip())) return NextResponse.json(datos, init);
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
