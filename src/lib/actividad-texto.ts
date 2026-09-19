// Traduce una fila de ActividadUsuario a algo que se lee de un vistazo:
// "Abrió Control publicitario › Enlazar pedidos · mes julio 2026" en vez de
// "GET /dashboard/control?vista=enlazar&periodo=mes-2026-7".
//
// Es puro (sin base ni servidor) para usarlo en la pantalla de seguimiento.

export type EventoActividad = {
  id: string;
  momento: string;
  tipo: string;
  ruta: string;
  detalle: string | null;
  ip: string | null;
  navegador: string | null;
};

const PANTALLAS: [RegExp, string][] = [
  [/^\/dashboard\/?$/, "Panel"],
  [/^\/dashboard\/control/, "Control publicitario"],
  [/^\/dashboard\/rentabilidad/, "Rentabilidad"],
  [/^\/dashboard\/calculadora\/costeo/, "Costeo y utilidad"],
  [/^\/dashboard\/calculadora/, "Calculadora"],
  [/^\/dashboard\/productos\/[^/]+/, "Ficha de producto"],
  [/^\/dashboard\/productos/, "Productos"],
  [/^\/dashboard\/contenido/, "Contenido"],
  [/^\/dashboard\/ceo/, "Estadísticas CEO"],
  [/^\/dashboard\/clientes/, "Clientes"],
  [/^\/dashboard\/logistica/, "Torre logística"],
  [/^\/dashboard\/reportes/, "Reportes diarios"],
  [/^\/dashboard\/desempeno/, "Desempeño"],
  [/^\/dashboard\/sin-nomenclatura/, "Sin nomenclatura"],
  [/^\/dashboard\/notificaciones/, "Notificaciones"],
  [/^\/dashboard\/conexiones/, "Conexiones"],
  [/^\/dashboard\/configuracion/, "Configuraciones"],
  [/^\/dashboard\/usuarios/, "Usuarios"],
  [/^\/dashboard\/chat/, "Chat interno"],
  [/^\/dashboard\/jarvis/, "Preguntarle a Jarvis"],
  [/^\/dashboard\/nomina/, "Nómina"],
];

const VISTAS: Record<string, string> = {
  resultados: "Resultados",
  economia: "Economía por producto",
  enlazar: "Enlazar pedidos",
  calendario: "Calendario",
  dia: "Día a día",
  tablero: "Día a día",
  requerimientos: "Requerimientos",
  lotes: "Lotes",
  referencias: "Referencias",
  campanas: "Gestión de campañas",
  rendimiento: "Rendimiento",
};

const RANGOS: Record<string, string> = {
  hoy: "hoy",
  ayer: "ayer",
  "7d": "últimos 7 días",
  "30d": "últimos 30 días",
  "3m": "últimos 3 meses",
  mes: "este mes",
  "mes-pasado": "mes pasado",
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function filtros(q: URLSearchParams): string[] {
  const out: string[] = [];
  const rango = q.get("rango") ?? q.get("periodo");
  const mes = rango ? /^mes-(\d{4})-(\d{1,2})$/.exec(rango) : null;
  if (mes) out.push(`${MESES[Number(mes[2]) - 1]} ${mes[1]}`);
  else if (rango) out.push(RANGOS[rango] ?? rango);
  if (q.get("desde") && q.get("hasta")) out.push(`del ${q.get("desde")} al ${q.get("hasta")}`);
  if (q.get("platform")) out.push(q.get("platform") === "TIKTOK" ? "TikTok" : "Meta");
  const productos = q.get("productos");
  if (productos) {
    const n = productos.split(",").filter(Boolean).length;
    out.push(`${n} producto${n === 1 ? "" : "s"} filtrado${n === 1 ? "" : "s"}`);
  }
  if (q.get("hora")) out.push(`corte ${q.get("hora")} h`);
  if (q.get("q")) out.push(`buscó «${q.get("q")}»`);
  return out;
}

function pantalla(camino: string, q: URLSearchParams) {
  const base = PANTALLAS.find(([r]) => r.test(camino))?.[1] ?? camino.replace(/^\/dashboard\/?/, "") ?? "Panel";
  let nombre = base;
  if (base === "Ficha de producto") nombre = `Ficha del producto ${decodeURIComponent(camino.split("/")[3] ?? "")}`;
  const vista = q.get("vista");
  if (vista) nombre += ` › ${VISTAS[vista] ?? vista}`;
  return nombre;
}

// Acciones: [método (o * para cualquiera), patrón del endpoint, texto].
const ACCIONES: [string, RegExp, string][] = [
  ["POST", /^\/api\/requirements$/, "Creó una pieza"],
  ["DELETE", /^\/api\/requirements\/[^/]+$/, "Eliminó una pieza"],
  ["*", /^\/api\/requirements\/[^/]+\/comments/, "Comentó una pieza"],
  ["*", /^\/api\/requirements\/[^/]+\/versions/, "Subió o cambió una versión de una pieza"],
  ["*", /^\/api\/requirements\/[^/]+$/, "Editó una pieza"],
  ["*", /^\/api\/enlaces-shopify\/excluir/, "Marcó un nombre de pedido como testeo / no es producto"],
  ["*", /^\/api\/enlaces-shopify/, "Enlazó pedidos de Shopify con un producto"],
  ["*", /^\/api\/control\/economia\/copiar/, "Copió la economía del mes anterior"],
  ["*", /^\/api\/control\/economia/, "Editó la economía por producto"],
  ["*", /^\/api\/control\/gasto-adm/, "Editó el gasto administrativo del mes"],
  ["*", /^\/api\/productos\/[^/]+\/responsables/, "Cambió los responsables de un producto"],
  ["*", /^\/api\/productos\/[^/]+\/angulos/, "Agregó un ángulo a un producto"],
  ["*", /^\/api\/productos\/assets/, "Editó el repositorio de un producto"],
  ["POST", /^\/api\/productos$/, "Creó un producto"],
  ["DELETE", /^\/api\/productos\/[^/]+$/, "Eliminó o archivó un producto"],
  ["*", /^\/api\/productos/, "Editó un producto"],
  ["POST", /^\/api\/users$/, "Creó un usuario"],
  ["DELETE", /^\/api\/users\/[^/]+$/, "Eliminó un usuario"],
  ["*", /^\/api\/users\/[^/]+$/, "Editó un usuario (rol, permisos o clave)"],
  ["*", /^\/api\/auth\/change-password/, "Cambió su clave"],
  ["*", /^\/api\/auth\/change-email/, "Cambió su correo"],
  ["*", /^\/api\/profile/, "Editó su perfil"],
  ["*", /^\/api\/chat\/pins/, "Fijó un mensaje en el chat"],
  ["*", /^\/api\/chat\/reactions/, "Reaccionó a un mensaje"],
  ["*", /^\/api\/chat\/channels/, "Creó o editó un canal del chat"],
  ["*", /^\/api\/chat\/calendario/, "Agendó una actividad en el calendario"],
  ["*", /^\/api\/chat\/anuncios/, "Publicó un anuncio"],
  ["*", /^\/api\/chat$/, "Envió un mensaje en el chat"],
  ["*", /^\/api\/jarvis\/chat/, "Le preguntó a Jarvis"],
  ["*", /^\/api\/jarvis\/actions/, "Aprobó o rechazó una acción propuesta por Jarvis"],
  ["*", /^\/api\/jarvis\/conversaciones/, "Borró o renombró una conversación con Jarvis"],
  ["*", /^\/api\/acciones/, "Decidió una acción sobre un producto"],
  ["*", /^\/api\/accounts\/[^/]+\/connect/, "Conectó una cuenta publicitaria"],
  ["*", /^\/api\/accounts\/[^/]+\/sync/, "Sincronizó a mano una cuenta publicitaria"],
  ["DELETE", /^\/api\/accounts\/[^/]+$/, "Eliminó una cuenta publicitaria"],
  ["*", /^\/api\/accounts/, "Editó una cuenta publicitaria"],
  ["*", /^\/api\/shopify\/connect/, "Conectó la tienda de Shopify"],
  ["*", /^\/api\/shopify\/sync/, "Sincronizó a mano Shopify"],
  ["*", /^\/api\/windsor\/sync/, "Sincronizó a mano Meta/TikTok"],
  ["*", /^\/api\/notion\/desconectar/, "Desconectó Notion"],
  ["*", /^\/api\/notion/, "Conectó o importó Notion"],
  ["*", /^\/api\/dropi/, "Conectó Dropi"],
  ["*", /^\/api\/nomina\/pagar/, "Registró un pago de nómina"],
  ["*", /^\/api\/nomina/, "Editó la nómina"],
  ["*", /^\/api\/contenido\/tareas/, "Editó una tarea del día a día"],
  ["*", /^\/api\/contenido\/campanas/, "Editó la gestión de campañas"],
  ["*", /^\/api\/contenido\/cierre/, "Cerró el día de contenido"],
  ["*", /^\/api\/rondas/, "Creó o editó un lote"],
  ["*", /^\/api\/referencias/, "Creó o editó una referencia"],
  ["*", /^\/api\/board/, "Editó el tablero"],
  ["*", /^\/api\/calculadora/, "Guardó un ajuste de la calculadora"],
  ["*", /^\/api\/catalogo/, "Editó el catálogo"],
  ["*", /^\/api\/reports\/generate/, "Generó un reporte"],
  ["*", /^\/api\/alerts\/check/, "Revisó alertas a mano"],
  ["*", /^\/api\/correo\/prueba/, "Mandó un correo de prueba"],
  ["*", /^\/api\/capacitacion\/reiniciar/, "Reinició la capacitación de alguien"],
];

const DESCARGAS: [RegExp, string][] = [
  [/^\/api\/clientes\/csv/, "Descargó la lista de clientes (CSV)"],
  [/^\/api\/reportes\/periodo/, "Descargó el informe del período (PDF)"],
  [/^\/api\/productos\/[^/]+\/reporte/, "Descargó el reporte de un producto"],
  [/^\/api\/reports\/[^/]+\/pdf/, "Descargó un reporte diario (PDF)"],
];

export type Descripcion = { titulo: string; detalle: string | null };

export function describirActividad(e: Pick<EventoActividad, "tipo" | "ruta" | "detalle">): Descripcion {
  const [camino, busqueda = ""] = e.ruta.split("?");
  const q = new URLSearchParams(busqueda);

  switch (e.tipo) {
    case "entrada":
      return { titulo: "Entró a la aplicación", detalle: null };
    case "salida":
      return { titulo: "Cerró sesión", detalle: null };
    case "login_fallido":
      return { titulo: "Intento de entrada fallido", detalle: e.detalle };
    case "jarvis":
      return { titulo: "Le preguntó a Jarvis", detalle: e.detalle };
    case "busqueda":
      return { titulo: `Buscó «${e.detalle ?? ""}»`, detalle: `en ${pantalla(camino, q)}` };
    case "vista": {
      const f = filtros(q);
      return { titulo: `Abrió ${pantalla(camino, q)}`, detalle: f.length ? f.join(" · ") : null };
    }
    case "descarga":
      return { titulo: DESCARGAS.find(([r]) => r.test(camino))?.[1] ?? "Descargó un archivo", detalle: filtros(q).join(" · ") || null };
    case "accion": {
      const metodo = e.detalle ?? "POST";
      const a = ACCIONES.find(([m, r]) => (m === "*" || m === metodo) && r.test(camino));
      if (a) return { titulo: a[2], detalle: null };
      const verbo = metodo === "DELETE" ? "Eliminó" : metodo === "POST" ? "Creó" : "Editó";
      return { titulo: `${verbo} algo en ${camino.replace(/^\/api\//, "")}`, detalle: null };
    }
    default:
      return { titulo: e.tipo, detalle: e.ruta };
  }
}

/** "Chrome en Windows" a partir del user-agent. Lo justo para reconocer el equipo. */
export function describirNavegador(ua: string | null) {
  if (!ua) return null;
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  const so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  return so ? `${nav} en ${so}` : nav;
}
