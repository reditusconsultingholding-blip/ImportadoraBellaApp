import { db } from "@/lib/db";
import {
  retrieveDatabase,
  queryDatabase,
  filasDeBaseNueva,
  NotionError,
  buscarBasesConTitulo,
  tituloDePagina,
  paginaMadreDeBase,
  casillasDePagina,
  tituloDe,
  primeraFecha,
  type PaginaMadre,
  type NotionDatabaseSchema,
  type NotionPage,
  type NotionPropertyValue,
  type NotionPropertyType,
} from "./notion";
import { matchProduct } from "./windsor-sync";
import { normalizar, parseCampaignRef } from "@/lib/product-code";
import { sincronizarResponsables } from "@/lib/integrations/notion-responsables";
import { Prisma } from "@/generated/prisma/client";

// El import único desde Notion: lee las dos bases del equipo (tareas diarias
// y gestión de campañas), las mapea a TareaDiaria / CampanaManual, y las
// guarda. Se puede correr en modo dry-run (calcula y no escribe) para
// revisar antes del import real, y es idempotente sobre
// (organizationId, notionPageId) — correrlo dos veces no duplica nada.
//
// CÓMO ORGANIZA SUS TAREAS ESTE EQUIPO
// No con una base y una columna de fecha, sino con una base NUEVA por día,
// todas llamadas "CONTENIDO DEL DÍA", cada una dentro de una página del
// "Calendario de contenido Marketing". Eso obliga a tres cosas que no son
// obvias: buscar las bases hermanas por título en vez de leer solo la
// configurada; sacar la fecha de cada fila de la página del calendario donde
// vive su base (las columnas no la traen, y la hora de creación de la fila
// miente en cuanto alguien duplica la tabla de otro día); y leer también las
// páginas "act …" del mismo calendario, donde Emilia anota sus actividades
// como casillas.

/** Cuántos días hacia atrás se leen. El trabajo del mes pasado ya no se reparte. */
const TOPE_BASES = 45;

/** Días hacia atrás de las páginas "act …" del calendario que se leen. */
const DIAS_ACTIVIDADES = 45;

/** Ventana en la que se quitan de Jarvis las filas borradas en Notion. */
const DIAS_LIMPIEZA = 14;

/** Origen de las tareas que vienen de las casillas de una página "act …". */
const ORIGEN_ACTIVIDAD = "notion-act";

/** El valor que más se repite (el calendario donde viven las tablas diarias). */
function masFrecuente(valores: (string | null)[]): string | null {
  const cuenta = new Map<string, number>();
  for (const v of valores) if (v) cuenta.set(v, (cuenta.get(v) ?? 0) + 1);
  let mejor: string | null = null;
  for (const [v, n] of cuenta) if (!mejor || n > cuenta.get(mejor)!) mejor = v;
  return mejor;
}

/** Solo letras, sin tildes y en minúscula: "Emilia Villegas" → "emiliavillegas". */
function letras(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Notion devuelve los ids con y sin guiones según el endpoint. */
const normalizarId = (id: string) => id.replace(/-/g, "").toLowerCase();

/**
 * Los estados de Notion, traídos al vocabulario de la app.
 *
 * Sin esto entraban tal cual —"Listo", "Sin empezar"— y quedaban dos idiomas
 * en la misma columna: los filtros, los colores y el conteo de pendientes
 * miraban las constantes de la app y no encontraban ninguna de las filas
 * importadas, que además eran el 100% del tablero.
 */
const ESTADO_DESDE_NOTION: Record<string, string> = {
  "sin empezar": "PENDIENTE",
  "por hacer": "PENDIENTE",
  pendiente: "PENDIENTE",
  "en progreso": "EN_PROGRESO",
  "en curso": "EN_PROGRESO",
  haciendo: "EN_PROGRESO",
  listo: "HECHO",
  hecho: "HECHO",
  completado: "HECHO",
  terminado: "HECHO",
  "no se cumplio": "NO_CUMPLIDO",
  "no cumplido": "NO_CUMPLIDO",
  "por pautar": "POR_PAUTAR",
};

export function estadoCanonico(texto: string | null): string {
  if (!texto) return "PENDIENTE";
  // normalizar() devuelve MAYÚSCULAS —se usa para comparar códigos de
  // producto—, así que hay que bajarlo antes de buscar en la tabla. Sin este
  // toLowerCase no coincidía ninguna clave y las 1.103 tareas importadas caían
  // todas en "PENDIENTE", incluidas las 894 que ya estaban listas.
  return ESTADO_DESDE_NOTION[normalizar(texto).toLowerCase()] ?? "PENDIENTE";
}

// --- Coerción por tipo de propiedad -----------------------------------------

function textoPlano(value: NotionPropertyValue, tipo: NotionPropertyType): string | null {
  switch (tipo) {
    case "title":
    case "rich_text": {
      const arr = (value[tipo] as { plain_text: string }[]) ?? [];
      const texto = arr.map((t) => t.plain_text).join("");
      return texto || null;
    }
    case "select": {
      const sel = value.select as { name: string } | null;
      return sel?.name ?? null;
    }
    case "status": {
      const sel = value.status as { name: string } | null;
      return sel?.name ?? null;
    }
    case "url":
    case "email":
    case "phone_number":
      return (value[tipo] as string | null) ?? null;
    case "unique_id": {
      const u = value.unique_id as { number: number | null; prefix: string | null } | null;
      return u?.number != null ? `${u.prefix ?? ""}${u.number}` : null;
    }
    case "formula": {
      const f = value.formula as { type: string; string?: string; number?: number; boolean?: boolean } | null;
      if (!f) return null;
      if (f.type === "string") return f.string ?? null;
      if (f.type === "number") return f.number != null ? String(f.number) : null;
      if (f.type === "boolean") return f.boolean ? "true" : "false";
      return null;
    }
    default:
      return null;
  }
}

function numeroDe(value: NotionPropertyValue, tipo: NotionPropertyType): number | null {
  if (tipo === "number") return (value.number as number | null) ?? null;
  if (tipo === "formula") {
    const f = value.formula as { type: string; number?: number } | null;
    return f?.type === "number" ? (f.number ?? null) : null;
  }
  if (tipo === "rollup") {
    const r = value.rollup as { type: string; number?: number; array?: NotionPropertyValue[] } | null;
    if (r?.type === "number") return r.number ?? null;
    return null;
  }
  const texto = textoPlano(value, tipo);
  const n = texto != null ? Number(texto) : NaN;
  return Number.isFinite(n) ? n : null;
}

function boolDe(value: NotionPropertyValue): boolean {
  return value.checkbox === true;
}

function multiSelectDe(value: NotionPropertyValue, tipo: NotionPropertyType): string[] {
  if (tipo === "multi_select") {
    return ((value.multi_select as { name: string }[]) ?? []).map((o) => o.name);
  }
  const unico = textoPlano(value, tipo);
  return unico ? [unico] : [];
}

/**
 * Un instante, llevado a la marca del día ecuatoriano al que pertenece.
 *
 * TareaDiaria.fecha es una MARCA DE DÍA a medianoche UTC en todo el módulo de
 * Contenido: así la comparan el calendario, el resumen del día y el aviso de
 * pendientes. Al traer la fecha de la hora de creación de la fila en Notion se
 * guardaba el instante completo, con hora, y eso rompía las tres cosas en
 * silencio: el calendario agrupaba cada tarea en su propio "día" —y mostraba
 * "1 tarea" donde había seis— y las consultas que buscan por medianoche exacta
 * no encontraban ninguna.
 */
function marcaDeDiaEc(instante: Date): Date {
  const local = new Date(instante.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** El inicio de una fecha de Notion ("2026-09-19" o con hora) como marca del día ecuatoriano. */
export function diaDeInicio(start: string | null | undefined): Date | null {
  if (!start) return null;
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(start);
  if (soloFecha) return new Date(`${start}T00:00:00.000Z`);
  // Datetime completo: se pasa al día ecuatoriano (-5h) antes de tomar la
  // marca de día, mismo criterio que el resto del módulo de Contenido.
  const instante = new Date(start);
  if (Number.isNaN(instante.getTime())) return null;
  return marcaDeDiaEc(instante);
}

/** Fecha de una propiedad `date` — día ecuatoriano como marca UTC de medianoche. */
function fechaDe(value: NotionPropertyValue): Date | null {
  const d = value.date as { start: string } | null;
  return diaDeInicio(d?.start);
}

/**
 * ¿Es una página de actividades personales del calendario? ("act emi",
 * "ACT EMI", "ACTE MI", "emi act"…) — y de quién, por lo que queda del título.
 *
 * Se quitan los espacios antes de buscar "act" porque el equipo lo escribe de
 * todas las formas: "ACTE MI" es "act emi" con el espacio corrido.
 */
export function actividadDelTitulo(titulo: string): { quien: string } | null {
  const plano = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (!plano || plano.startsWith("contenido")) return null;
  // "act" al principio o al final ("act emi", "emi act"): así "Contacto" o
  // "Impacto de…" no pasan por páginas de actividades.
  const m = plano.match(/^(?:actividades|actividad|act)(.*)$/) ?? plano.match(/^(.*?)(?:actividades|actividad|act)$/);
  if (!m) return null;
  const quien = m[1];
  // Un título largo que solo contiene "act" (p. ej. "impacto de la campaña")
  // no es una página de actividades.
  if (quien.length === 0 || quien.length > 12) return null;
  return { quien };
}

/** Cuántos creativos dice una casilla: "5 CREATIVOS COMBO…" → 5. */
export function creativosDeTexto(texto: string): number {
  const m = texto.match(/(\d{1,3})\s*creativ/i);
  return m ? Number(m[1]) : 0;
}

function personasDe(value: NotionPropertyValue): { id: string; name: string | null; email: string | null }[] {
  const arr = (value.people as { id: string; name?: string; person?: { email?: string } }[]) ?? [];
  return arr.map((p) => ({ id: p.id, name: p.name ?? null, email: p.person?.email ?? null }));
}

function relacionesDe(value: NotionPropertyValue): string[] {
  return ((value.relation as { id: string }[]) ?? []).map((r) => r.id);
}

// --- Mapeo de columnas -------------------------------------------------------

type CampoObjetivo =
  | "producto"
  | "responsable"
  | "plataforma"
  | "numeroCreativos"
  | "estado"
  | "etiquetas"
  | "campanaTiktok"
  | "campanaMeta"
  | "fecha"
  | "notas"
  | "nombre"
  | "activa";

const CANDIDATOS_TAREAS: Record<CampoObjetivo, string[]> = {
  producto: ["producto", "product"],
  responsable: ["responsable", "encargado", "editor", "asignado"],
  plataforma: ["plataforma", "plataformas", "red"],
  // "Número" a secas está en las bases diarias de este equipo y es la cantidad
  // de creativos de esa fila; sin él la columna entraba siempre en cero.
  numeroCreativos: [
    "nº de creativos",
    "n° de creativos",
    "creativos",
    "numero de creativos",
    "número de creativos",
    "numero",
    "número",
  ],
  estado: ["estado", "status", "situacion", "situación", "etiqueta"],
  etiquetas: ["etiquetas", "tags", "labels"],
  campanaTiktok: ["realizar campañas tiktok", "realizar campanas tiktok", "campañas tiktok", "campanas tiktok"],
  campanaMeta: ["realizar campañas meta", "realizar campanas meta", "campañas meta", "campanas meta"],
  fecha: ["fecha", "dia", "día", "date", "fecha de entrega"],
  // "PAUTADO" y "OBSERVACIÓN" son las dos formas que tuvo esa columna en las
  // bases diarias, según el mes.
  notas: ["notas", "observaciones", "observacion", "observación", "comentarios", "pautado"],
  nombre: [],
  activa: [],
};

const CANDIDATOS_CAMPANAS: Record<CampoObjetivo, string[]> = {
  nombre: ["nombre", "campaña", "campana", "campaign", "name"],
  producto: ["producto", "product"],
  activa: ["activa", "activo", "estado", "¿activa?", "status"],
  notas: ["notas", "observaciones"],
  responsable: [],
  plataforma: ["plataforma", "plataformas", "red"],
  numeroCreativos: [],
  estado: [],
  etiquetas: [],
  campanaTiktok: [],
  campanaMeta: [],
  fecha: [],
};

type PropiedadResuelta = { nombre: string; tipo: NotionPropertyType };
type MapeoResuelto = Partial<Record<CampoObjetivo, PropiedadResuelta>>;

function resolverMapeo(
  schema: NotionDatabaseSchema,
  candidatos: Record<CampoObjetivo, string[]>
): { mapeo: MapeoResuelto; sinMapear: string[] } {
  const propsNormalizadas = Object.entries(schema.properties).map(([nombre, p]) => ({
    nombre,
    tipo: p.type,
    clave: normalizar(nombre),
  }));

  const mapeo: MapeoResuelto = {};
  const usadas = new Set<string>();

  for (const [campo, opciones] of Object.entries(candidatos) as [CampoObjetivo, string[]][]) {
    if (opciones.length === 0) continue;
    const opcionesNorm = opciones.map(normalizar);
    const match = propsNormalizadas.find((p) => !usadas.has(p.nombre) && opcionesNorm.includes(p.clave));
    if (match) {
      mapeo[campo] = { nombre: match.nombre, tipo: match.tipo };
      usadas.add(match.nombre);
    }
  }

  const sinMapear = propsNormalizadas.filter((p) => !usadas.has(p.nombre)).map((p) => p.nombre);
  return { mapeo, sinMapear };
}

// --- El import ---------------------------------------------------------------

export type ReporteImport = {
  tareas: {
    creadas: number;
    actualizadas: number;
    sinProducto: string[];
    sinResponsable: string[];
    sinFecha: number;
    /** Cuántas bases diarias se leyeron en esta corrida. */
    basesLeidas: number;
    /** Bases fechadas por su página del calendario (el resto cae a la hora de creación). */
    basesConDia: number;
    /** Casillas leídas de las páginas "act …" del calendario. */
    actividades: number;
    /** Tareas que ya no existen en Notion y se quitaron. */
    borradas: number;
    /**
     * Qué pasó al buscar las páginas "act …", en una línea.
     *
     * La primera versión corrió en producción y leyó cero actividades sin
     * decir por qué: el error se tragaba en silencio y no había forma de saber
     * si faltaba el calendario, si no había páginas o si ningún título calzaba.
     */
    actividadesDiag: string;
  };
  campanas: {
    manualCreadas: number;
    manualActualizadas: number;
    vinculadas: number;
    sinMatch: number;
  };
  columnasNoMapeadas: { base: "tareas" | "campanas"; columnas: string[] }[];
  muestras: Record<string, unknown>[];
};

async function valorDe(
  token: string,
  page: NotionPage,
  mapeo: MapeoResuelto,
  campo: CampoObjetivo
): Promise<{ texto: string | null; relacionIds: string[] }> {
  const prop = mapeo[campo];
  if (!prop) return { texto: null, relacionIds: [] };
  const value = page.properties[prop.nombre];
  if (!value) return { texto: null, relacionIds: [] };

  if (prop.tipo === "relation") {
    const ids = relacionesDe(value);
    if (ids.length === 0) return { texto: null, relacionIds: [] };
    const titulo = await tituloDePagina(token, ids[0]);
    return { texto: titulo, relacionIds: ids };
  }
  return { texto: textoPlano(value, prop.tipo), relacionIds: [] };
}

export async function importarNotion(
  organizationId: string,
  opciones: { dryRun: boolean }
): Promise<ReporteImport> {
  const conexion = await db.notionConnection.findUnique({ where: { organizationId } });
  if (!conexion?.token) throw new Error("No hay una conexión de Notion configurada.");
  const token = conexion.token;

  const reporte: ReporteImport = {
    tareas: {
      creadas: 0,
      actualizadas: 0,
      sinProducto: [],
      sinResponsable: [],
      sinFecha: 0,
      basesLeidas: 0,
      basesConDia: 0,
      actividades: 0,
      borradas: 0,
      actividadesDiag: "",
    },
    campanas: { manualCreadas: 0, manualActualizadas: 0, vinculadas: 0, sinMatch: 0 },
    columnasNoMapeadas: [],
    muestras: [],
  };

  const [products, users, campanasSincronizadas, tareasExistentes, manualesExistentes] = await Promise.all([
    db.product.findMany({ where: { organizationId }, select: { id: true, code: true, name: true } }),
    db.user.findMany({ where: { organizationId }, select: { id: true, name: true, email: true, apodos: true } }),
    db.campaign.findMany({ where: { adAccount: { organizationId } }, select: { id: true, name: true } }),
    db.tareaDiaria.findMany({
      where: { organizationId, notionPageId: { not: null } },
      select: {
        notionPageId: true,
        fecha: true,
        ownerId: true,
        responsableTexto: true,
        productId: true,
        productoTexto: true,
        plataforma: true,
        campanaTiktok: true,
        campanaMeta: true,
        numeroCreativos: true,
        estado: true,
        etiquetas: true,
        notas: true,
        origen: true,
      },
    }),
    db.campanaManual.findMany({ where: { organizationId, notionPageId: { not: null } }, select: { notionPageId: true } }),
  ]);
  const idsTareasExistentes = new Set(tareasExistentes.map((t) => t.notionPageId));
  // Lo guardado de cada tarea, para escribir solo las que cambiaron en Notion.
  // Antes se reescribían todas en cada vuelta: 27.000 UPDATE cada ocho horas
  // para dejar exactamente lo mismo, y cada uno vaciaba la memoria de las
  // pantallas (ver src/lib/memoria.ts).
  const huellaTarea = (t: Record<string, unknown>) =>
    JSON.stringify([
      t.fecha instanceof Date ? t.fecha.toISOString() : t.fecha ?? null,
      t.ownerId ?? null,
      t.responsableTexto ?? null,
      t.productId ?? null,
      t.productoTexto ?? null,
      t.plataforma ?? null,
      t.campanaTiktok,
      t.campanaMeta,
      t.numeroCreativos,
      t.estado,
      t.etiquetas,
      t.notas ?? null,
      t.origen,
    ]);
  const huellaGuardada = new Map(tareasExistentes.map((t) => [t.notionPageId, huellaTarea(t)]));
  const idsManualesExistentes = new Set(manualesExistentes.map((m) => m.notionPageId));
  const nombresCampanasSincronizadas = new Set(campanasSincronizadas.map((c) => normalizar(c.name)));

  function matchResponsable(nombre: string | null, email: string | null) {
    if (email) {
      const porEmail = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (porEmail) return porEmail;
    }
    if (nombre) {
      const clave = normalizar(nombre);
      const porNombre = users.find((u) => normalizar(u.name) === clave || normalizar(u.name).includes(clave));
      if (porNombre) return porNombre;
    }
    return null;
  }

  /** "emi" → Emilia: primero los apodos anotados en Usuarios, después el nombre. */
  function porApodo(quien: string) {
    if (quien.length < 2) return null;
    return (
      users.find((u) => u.apodos.some((a) => letras(a) === quien)) ??
      users.find((u) => letras(u.name.split(" ")[0] ?? "").startsWith(quien)) ??
      null
    );
  }

  // --- Tareas diarias --------------------------------------------------------
  if (conexion.tareasDatabaseId) {
    const schema = await retrieveDatabase(token, conexion.tareasDatabaseId);
    const { mapeo, sinMapear } = resolverMapeo(schema, CANDIDATOS_TAREAS);
    if (sinMapear.length > 0) reporte.columnasNoMapeadas.push({ base: "tareas", columnas: sinMapear });

    // Todas las bases del mismo nombre, no solo la configurada. Ver la nota de
    // arriba: acá cada día es una base distinta, y leer una sola es importar
    // un día y perder los otros noventa.
    const hermanas = await buscarBasesConTitulo(token, schema.title);
    const ids = [
      conexion.tareasDatabaseId,
      ...hermanas
        .map((h) => h.id)
        .filter((id) => normalizarId(id) !== normalizarId(conexion.tareasDatabaseId!)),
    ].slice(0, TOPE_BASES);
    reporte.tareas.basesLeidas = ids.length;

    const creadas: Prisma.TareaDiariaCreateManyInput[] = [];
    const filas: { page: NotionPage; diaBase: Date | null }[] = [];
    // La página del calendario de cada base: su fecha es el día de todas sus
    // filas, y su base madre es el calendario donde viven las páginas "act".
    const madres: PaginaMadre[] = [];
    for (const id of ids) {
      let madre: PaginaMadre | null = null;
      try {
        madre = await paginaMadreDeBase(token, id);
      } catch {
        madre = null; // sin la página madre se cae a la hora de creación, como antes
      }
      if (madre) madres.push(madre);
      const diaBase = diaDeInicio(madre?.fecha);
      if (diaBase) reporte.tareas.basesConDia += 1;
      for (const page of await queryDatabase(token, id)) filas.push({ page, diaBase });
    }

    const vistas = new Set<string>();

    /** Crea o actualiza una tarea venida de Notion (tabla o casilla), solo si cambió. */
    async function guardar(fila: Prisma.TareaDiariaCreateManyInput & { notionPageId: string }) {
      const id = fila.notionPageId;
      const yaExiste = idsTareasExistentes.has(id);
      if (opciones.dryRun) {
        if (yaExiste) reporte.tareas.actualizadas += 1;
        else reporte.tareas.creadas += 1;
        return;
      }
      if (yaExiste) {
        if (huellaGuardada.get(id) !== huellaTarea(fila)) {
          await db.tareaDiaria.updateMany({ where: { organizationId, notionPageId: id }, data: fila });
          reporte.tareas.actualizadas += 1;
        }
      } else {
        creadas.push(fila);
        idsTareasExistentes.add(id);
        reporte.tareas.creadas += 1;
      }
    }

    for (const { page, diaBase } of filas) {
      vistas.add(page.id);
      const [producto, responsableTxt, plataforma, estado, notas] = await Promise.all([
        valorDe(token, page, mapeo, "producto"),
        valorDe(token, page, mapeo, "responsable"),
        valorDe(token, page, mapeo, "plataforma"),
        valorDe(token, page, mapeo, "estado"),
        valorDe(token, page, mapeo, "notas"),
      ]);

      const propResponsable = mapeo.responsable ? page.properties[mapeo.responsable.nombre] : null;
      const propCreativos = mapeo.numeroCreativos ? page.properties[mapeo.numeroCreativos.nombre] : null;
      const propEtiquetas = mapeo.etiquetas ? page.properties[mapeo.etiquetas.nombre] : null;
      const propCTiktok = mapeo.campanaTiktok ? page.properties[mapeo.campanaTiktok.nombre] : null;
      const propCMeta = mapeo.campanaMeta ? page.properties[mapeo.campanaMeta.nombre] : null;
      const propFecha = mapeo.fecha ? page.properties[mapeo.fecha.nombre] : null;

      const nombreProducto = producto.texto;
      const productoMatch = nombreProducto ? matchProduct(nombreProducto, products) : null;
      if (nombreProducto && !productoMatch) reporte.tareas.sinProducto.push(nombreProducto);

      let ownerId: string | null = null;
      let responsableTexto: string | null = responsableTxt.texto;
      if (propResponsable?.people) {
        const personas = personasDe(propResponsable);
        if (personas[0]) {
          const match = matchResponsable(personas[0].name, personas[0].email);
          ownerId = match?.id ?? null;
          responsableTexto = personas[0].name ?? responsableTexto;
        }
      } else if (responsableTxt.texto) {
        const match = matchResponsable(responsableTxt.texto, null);
        ownerId = match?.id ?? null;
      }
      if (responsableTexto && !ownerId) reporte.tareas.sinResponsable.push(responsableTexto);

      // La fecha: la de la fila si la trae; si no, la de la página del
      // calendario donde vive su base; y solo en último caso cuándo se creó la
      // fila.
      //
      // Las bases diarias no tienen columna de fecha —la fecha es la base—.
      // Usar la hora de creación como primera opción metía en el lunes las
      // filas del viernes que alguien duplicó o agregó el lunes (video de
      // Emilia, 21 de septiembre).
      const fechaVal =
        (propFecha ? fechaDe(propFecha) : null) ??
        diaBase ??
        (page.created_time ? marcaDeDiaEc(new Date(page.created_time)) : null);
      if (!fechaVal) reporte.tareas.sinFecha += 1;

      const numeroCreativos = propCreativos ? (numeroDe(propCreativos, mapeo.numeroCreativos!.tipo) ?? 0) : 0;
      const etiquetas = propEtiquetas ? multiSelectDe(propEtiquetas, mapeo.etiquetas!.tipo) : [];

      const fila = {
        organizationId,
        fecha: fechaVal,
        ownerId,
        responsableTexto,
        productId: productoMatch,
        productoTexto: productoMatch ? null : nombreProducto,
        plataforma: plataforma.texto ? plataforma.texto.toUpperCase().slice(0, 20) : null,
        campanaTiktok: propCTiktok ? boolDe(propCTiktok) : false,
        campanaMeta: propCMeta ? boolDe(propCMeta) : false,
        numeroCreativos: Math.max(0, Math.round(numeroCreativos)),
        estado: estadoCanonico(estado.texto),
        etiquetas,
        notas: notas.texto,
        origen: "notion",
        notionPageId: page.id,
      };

      if (reporte.muestras.length < 5) reporte.muestras.push({ base: "tareas", ...fila });
      await guardar(fila);
    }

    // --- Actividades personales del calendario ("act emi") -------------------
    //
    // Emilia no anota su trabajo en las tablas CONTENIDO DEL DÍA sino en
    // páginas propias del mismo calendario ("act emi"), con una lista "Por
    // hacer" de casillas. El import solo leía las tablas, así que sus
    // actividades no aparecían en Jarvis (video del 21 de septiembre). Cada
    // casilla entra como una tarea suya de ese día: marcada = hecha.
    const calendarioId = masFrecuente(madres.map((m) => m.baseId));
    let actividadesLeidas = false;
    if (!calendarioId) {
      reporte.tareas.actividadesDiag = `sin calendario: ${madres.length} páginas madre, ninguna dentro de una base`;
    }
    if (calendarioId) {
      try {
        const desdeDia = new Date(Date.now() - DIAS_ACTIVIDADES * 86_400_000).toISOString().slice(0, 10);
        // El calendario puede estar en el formato viejo (una tabla) o en el
        // nuevo (varias data sources). El de este equipo está en el nuevo, y
        // con la versión vieja de la API Notion se niega a consultarlo: era
        // la razón de que las actividades de Emilia no entraran nunca.
        let propFecha: string | undefined;
        let paginas: Awaited<ReturnType<typeof queryDatabase>>;
        try {
          const esquema = await retrieveDatabase(token, calendarioId);
          propFecha = Object.entries(esquema.properties).find(([, p]) => p.type === "date")?.[0];
          paginas = await queryDatabase(
            token,
            calendarioId,
            propFecha ? { property: propFecha, date: { on_or_after: desdeDia } } : undefined,
          );
        } catch (err) {
          if (!(err instanceof NotionError) || !/formato nuevo/.test(err.message)) throw err;
          propFecha = "data sources";
          paginas = await filasDeBaseNueva(token, calendarioId, desdeDia);
        }
        const titulos = paginas.map((pg) => tituloDe(pg.properties));
        const conAct = titulos.filter((t) => actividadDelTitulo(t));
        // Los títulos que no son "CONTENIDO DEL DÍA": entre ellos está la
        // página de actividades si el nombre no calzó con la regla.
        const otros = titulos.filter((t) => t && !/contenido/i.test(t) && !actividadDelTitulo(t));
        reporte.tareas.actividadesDiag =
          `calendario ok, fecha "${propFecha ?? "—"}", ${paginas.length} páginas, ${conAct.length} de actividades` +
          (conAct.length ? ` (${[...new Set(conAct)].slice(0, 4).join(" | ")})` : "") +
          (otros.length ? `; otros títulos: ${[...new Set(otros)].slice(0, 8).join(" | ")}` : "");
        for (const pagina of paginas) {
          const act = actividadDelTitulo(tituloDe(pagina.properties));
          if (!act) continue;
          const dia =
            diaDeInicio(primeraFecha(pagina.properties)) ??
            (pagina.created_time ? marcaDeDiaEc(new Date(pagina.created_time)) : null);

          // Quién: la columna de persona si la página la tiene; si no, lo que
          // queda del título ("emi") contra los apodos y los nombres.
          let owner: { id: string; name: string } | null = null;
          let responsableTexto = act.quien.toUpperCase();
          for (const prop of Object.values(pagina.properties)) {
            if (prop.type !== "people") continue;
            const persona = personasDe(prop)[0];
            if (persona) {
              owner = matchResponsable(persona.name, persona.email);
              responsableTexto = persona.name ?? responsableTexto;
            }
            break;
          }
          owner ??= porApodo(act.quien);
          if (owner) responsableTexto = owner.name;
          else reporte.tareas.sinResponsable.push(responsableTexto);

          for (const casilla of await casillasDePagina(token, pagina.id)) {
            vistas.add(casilla.id);
            reporte.tareas.actividades += 1;
            await guardar({
              organizationId,
              fecha: dia,
              ownerId: owner?.id ?? null,
              responsableTexto,
              productId: null,
              productoTexto: casilla.texto.slice(0, 200),
              plataforma: null,
              campanaTiktok: false,
              campanaMeta: false,
              numeroCreativos: creativosDeTexto(casilla.texto),
              estado: casilla.marcada ? "HECHO" : "PENDIENTE",
              etiquetas: ["actividad"],
              notas: null,
              origen: ORIGEN_ACTIVIDAD,
              notionPageId: casilla.id,
            });
          }
        }
        actividadesLeidas = true;
      } catch (err) {
        // Si el calendario no se puede leer, las tareas de las tablas igual
        // entran; solo no se tocan las actividades ya guardadas.
        actividadesLeidas = false;
        reporte.tareas.actividadesDiag = `error leyendo el calendario: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300);
      }
    }

    // --- Lo que ya no está en Notion -----------------------------------------
    //
    // Una fila borrada en Notion seguía viva en Jarvis para siempre: el import
    // solo creaba y actualizaba. Se quitan, pero solo dentro de la ventana que
    // se acaba de leer entera (los últimos días) y con un freno: si fuera a
    // borrar más de un tercio de esa ventana, algo raro pasó en la lectura y no
    // se borra nada.
    if (!opciones.dryRun && ids.length > 0) {
      const desde = new Date(Date.now() - DIAS_LIMPIEZA * 86_400_000);
      const origenes = actividadesLeidas ? ["notion", ORIGEN_ACTIVIDAD] : ["notion"];
      const enVentana = await db.tareaDiaria.findMany({
        where: { organizationId, origen: { in: origenes }, notionPageId: { not: null }, fecha: { gte: desde } },
        select: { id: true, notionPageId: true },
      });
      const sobran = enVentana.filter((t) => !vistas.has(t.notionPageId!));
      if (sobran.length > 0 && sobran.length <= enVentana.length / 3) {
        await db.tareaDiaria.deleteMany({ where: { id: { in: sobran.map((t) => t.id) } } });
        reporte.tareas.borradas = sobran.length;
      }
    }

    // Escritura por lotes de las nuevas — nunca fila por fila.
    if (!opciones.dryRun && creadas.length > 0) {
      for (let i = 0; i < creadas.length; i += 200) {
        await db.tareaDiaria.createMany({ data: creadas.slice(i, i + 200) });
      }
    }
  }

  // --- Gestión de campañas ----------------------------------------------------
  if (conexion.campanasDatabaseId) {
    const schema = await retrieveDatabase(token, conexion.campanasDatabaseId);
    const { mapeo, sinMapear } = resolverMapeo(schema, CANDIDATOS_CAMPANAS);
    if (sinMapear.length > 0) reporte.columnasNoMapeadas.push({ base: "campanas", columnas: sinMapear });

    const filas = await queryDatabase(token, conexion.campanasDatabaseId);
    const creadas: Prisma.CampanaManualCreateManyInput[] = [];

    for (const page of filas) {
      const [nombreProp, producto, notas] = await Promise.all([
        valorDe(token, page, mapeo, "nombre"),
        valorDe(token, page, mapeo, "producto"),
        valorDe(token, page, mapeo, "notas"),
      ]);
      const propActiva = mapeo.activa ? page.properties[mapeo.activa.nombre] : null;
      const propPlataforma = mapeo.plataforma ? page.properties[mapeo.plataforma.nombre] : null;

      const nombre = nombreProp.texto?.trim();
      if (!nombre) continue;

      // Ya existe como Campaign sincronizada — no hace falta la fila manual.
      if (nombresCampanasSincronizadas.has(normalizar(nombre))) {
        reporte.campanas.vinculadas += 1;
        continue;
      }

      const nombreProducto = producto.texto;
      const productoMatch = nombreProducto ? matchProduct(nombreProducto, products) : parseCampaignRef(nombre)?.code
        ? matchProduct(nombre, products)
        : null;
      if (nombreProducto && !productoMatch) reporte.campanas.sinMatch += 1;

      const activa = propActiva
        ? propActiva.type === "checkbox"
          ? boolDe(propActiva)
          : !/no|inactiv|pausad|apagad/i.test(textoPlano(propActiva, mapeo.activa!.tipo) ?? "")
        : true;

      const fila = {
        organizationId,
        nombre,
        productId: productoMatch,
        productoTexto: productoMatch ? null : nombreProducto,
        plataforma: propPlataforma ? textoPlano(propPlataforma, mapeo.plataforma!.tipo) : null,
        activa,
        notas: notas.texto,
        origen: "notion",
        notionPageId: page.id,
      };

      if (reporte.muestras.length < 10) reporte.muestras.push({ base: "campanas", ...fila });

      const yaExiste = idsManualesExistentes.has(page.id);
      if (opciones.dryRun) {
        if (yaExiste) reporte.campanas.manualActualizadas += 1;
        else reporte.campanas.manualCreadas += 1;
        continue;
      }

      if (yaExiste) {
        await db.campanaManual.updateMany({ where: { organizationId, notionPageId: page.id }, data: fila });
        reporte.campanas.manualActualizadas += 1;
      } else {
        creadas.push(fila);
        reporte.campanas.manualCreadas += 1;
      }
    }

    if (!opciones.dryRun && creadas.length > 0) {
      for (let i = 0; i < creadas.length; i += 200) {
        await db.campanaManual.createMany({ data: creadas.slice(i, i + 200) });
      }
    }
  }

  if (!opciones.dryRun) {
    await db.notionConnection.update({ where: { organizationId }, data: { lastImportAt: new Date() } });
  }

  return reporte;
}

/* -------------------------------------------------------------------------- */

/** Cada cuánto se vuelve a leer Notion. */
const CADA_MINUTOS = 10;

/**
 * La sincronización automática, para el reloj.
 *
 * El import existía solo como botón: alguien entraba a Contenido, apretaba
 * "Traer datos de Notion" y listo. En la práctica se apretó una vez. Ocho días
 * después el tablero del día seguía mostrando la jornada de aquel día, y el
 * equipo —que sí estaba cargando su trabajo en Notion— concluyó, con razón,
 * que la herramienta no mostraba lo de hoy.
 *
 * Una función que hay que acordarse de ejecutar no es una sincronización.
 *
 * Se apoya en SyncState para no leer Notion cada cinco minutos cuando el reloj
 * pasa: diez minutos es suficiente para que el tablero se sienta al día y no
 * castiga la cuota de la API.
 */
export async function sincronizarNotion(organizationId: string) {
  const FUENTE = "notion";

  const conexion = await db.notionConnection.findUnique({
    where: { organizationId },
    select: { token: true, tareasDatabaseId: true, campanasDatabaseId: true },
  });
  // Sin conexión no hay nada que sincronizar, y no es un error: hay
  // organizaciones que no usan Notion.
  if (!conexion?.token || (!conexion.tareasDatabaseId && !conexion.campanasDatabaseId)) return null;

  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    select: { okAt: true },
  });
  if (estado?.okAt && Date.now() - estado.okAt.getTime() < CADA_MINUTOS * 60_000) return null;

  const marcar = (detalle: string, error: string | null = null) =>
    db.syncState.upsert({
      where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
      create: { organizationId, fuente: FUENTE, okAt: new Date(), detalle, error },
      update: { okAt: new Date(), detalle, error },
    });

  try {
    const r = await importarNotion(organizationId, { dryRun: false });
    let detalle = `${r.tareas.creadas} nuevas, ${r.tareas.actualizadas} actualizadas, ${r.tareas.borradas} quitadas, ${r.tareas.basesLeidas} bases (${r.tareas.basesConDia} con fecha del calendario), ${r.tareas.actividades} actividades${r.tareas.actividadesDiag ? ` [${r.tareas.actividadesDiag}]` : ""}`;

    // Y quién lleva cada producto, desde PRODUCTOS ORDEN. Va en la misma
    // pasada porque es la misma conexión y el mismo ritmo: lo que Emilia
    // cambia en Notion tiene que llegar a Jarvis sin que nadie apriete nada.
    // Si falla, no tumba la importación de tareas: se anota y se sigue.
    try {
      const resp = await sincronizarResponsables(organizationId, conexion.token);
      if (resp) detalle += ` · responsables de ${resp.productos} productos`;
    } catch (e) {
      detalle += ` · responsables: ${e instanceof Error ? e.message : String(e)}`;
    }
    await marcar(detalle);
    return detalle;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    // Se marca el intento igual: sin esto, un token vencido haría que el reloj
    // reintentara contra Notion cada cinco minutos para siempre.
    await marcar("falló", mensaje);
    return `error: ${mensaje}`;
  }
}
