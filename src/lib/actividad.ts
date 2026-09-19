import { headers } from "next/headers";
import { db } from "@/lib/db";

// Seguimiento de actividad del equipo (lo ve solo OWNER, en Configuraciones).
//
// CÓMO SE REGISTRA
// El middleware marca cada pedido con su ruta, su método y un id único
// (encabezados x-jarvis-*, que pisa siempre: el navegador no los puede
// inventar). getSession —que corre en toda pantalla y toda ruta de API— llama
// a registrarPedido con el usuario ya validado. Así el registro vive en el
// servidor: nadie lo apaga bloqueando algo en su navegador.
//
// QUÉ SE REGISTRA
//   vista      abrir una pantalla del panel, con sus filtros (?rango=…)
//   accion     todo lo que cambia datos (POST/PUT/PATCH/DELETE a la API)
//   descarga   CSV y PDF
//   entrada / salida / login_fallido   desde las rutas de acceso
//   busqueda   lo que se escribe en un buscador (lo manda el navegador)
//
// QUÉ NO
// Las precargas de enlaces que hace Next (no son visitas), el refresco
// automático de la pantalla (se descarta la misma pantalla repetida dentro de
// 3 minutos) y el ruido técnico: latidos de la sala de voz, marcar
// notificaciones como leídas, suscripción push, el propio registro.

export type TipoActividad = "entrada" | "salida" | "login_fallido" | "recuperacion" | "vista" | "accion" | "descarga" | "busqueda";

const RUIDO = [
  /^\/api\/actividad/,
  /^\/api\/chat\/voz/,
  /^\/api\/push/,
  /^\/api\/notifications/,
  /^\/api\/capacitacion$/,
  /^\/api\/chat\/read/,
  /^\/api\/chat\/anuncios\/visto/,
];

const DESCARGAS = [/^\/api\/clientes\/csv/, /^\/api\/reportes\/periodo/, /\/reporte(\?|$)/, /\.pdf(\?|$)/, /^\/api\/reports\//];

const VISTA_REPETIDA_MS = 3 * 60 * 1000;
const ultimaVista = new Map<string, { ruta: string; momento: number }>();
const pedidosVistos = new Set<string>();

function recordarPedido(id: string) {
  if (pedidosVistos.has(id)) return false;
  pedidosVistos.add(id);
  if (pedidosVistos.size > 5000) pedidosVistos.delete(pedidosVistos.values().next().value as string);
  return true;
}

function ipDeEncabezados(h: Headers) {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const partes = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (partes.length) return partes[partes.length - 1];
  }
  return h.get("x-real-ip");
}

/** Escribe una fila sin demorar la respuesta. Un fallo acá nunca rompe la pantalla. */
export function registrarActividad(datos: {
  organizationId: string;
  userId: string;
  tipo: TipoActividad;
  ruta: string;
  detalle?: string | null;
  ip?: string | null;
  navegador?: string | null;
}) {
  db.actividadUsuario
    .create({
      data: {
        organizationId: datos.organizationId,
        userId: datos.userId,
        tipo: datos.tipo,
        ruta: datos.ruta.slice(0, 500),
        detalle: datos.detalle?.slice(0, 500) ?? null,
        ip: datos.ip?.slice(0, 64) ?? null,
        navegador: datos.navegador?.slice(0, 200) ?? null,
      },
      select: { id: true },
    })
    .catch((err) => console.error("[actividad] no se pudo registrar:", err instanceof Error ? err.message : err));
}

/** Datos del pedido en curso, para las rutas que registran a mano (login). */
export async function contextoDelPedido() {
  try {
    const h = await headers();
    return { ip: ipDeEncabezados(h), navegador: h.get("user-agent") };
  } catch {
    return { ip: null, navegador: null };
  }
}

/** Lo llama getSession con el usuario ya validado. */
export async function registrarPedido(usuario: { id: string; organizationId: string }) {
  let h: Headers;
  try {
    h = await headers();
  } catch {
    return; // fuera de un pedido (reloj, scripts)
  }
  const id = h.get("x-jarvis-pedido");
  const ruta = h.get("x-jarvis-ruta");
  const metodo = h.get("x-jarvis-metodo") ?? "GET";
  if (!id || !ruta || h.get("x-jarvis-precarga") === "1") return;
  if (!recordarPedido(id)) return;

  const camino = ruta.split("?")[0];
  let tipo: TipoActividad | null = null;
  if (camino.startsWith("/api/")) {
    if (RUIDO.some((r) => r.test(camino))) return;
    if (metodo !== "GET") tipo = "accion";
    else if (DESCARGAS.some((r) => r.test(ruta))) tipo = "descarga";
  } else if (camino.startsWith("/dashboard")) {
    const previa = ultimaVista.get(usuario.id);
    const ahora = Date.now();
    if (previa && previa.ruta === ruta && ahora - previa.momento < VISTA_REPETIDA_MS) return;
    ultimaVista.set(usuario.id, { ruta, momento: ahora });
    tipo = "vista";
  }
  if (!tipo) return;

  registrarActividad({
    organizationId: usuario.organizationId,
    userId: usuario.id,
    tipo,
    ruta,
    detalle: tipo === "accion" ? metodo : null,
    ip: ipDeEncabezados(h),
    navegador: h.get("user-agent"),
  });
}

/** Retención: 90 días. Lo llama el reloj una vez por día. */
export async function limpiarActividadVieja() {
  const r = await db.actividadUsuario.deleteMany({
    where: { momento: { lt: new Date(Date.now() - 90 * 86400_000) } },
  });
  return r.count;
}
