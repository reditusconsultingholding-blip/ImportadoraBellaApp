import { db } from "@/lib/db";
import {
  retrieveDatabase,
  queryDatabase,
  tituloDePagina,
  type NotionDatabaseSchema,
  type NotionPage,
  type NotionPropertyValue,
  type NotionPropertyType,
} from "./notion";
import { matchProduct } from "./windsor-sync";
import { normalizar, parseCampaignRef } from "@/lib/product-code";
import { Prisma } from "@/generated/prisma/client";

// El import único desde Notion: lee las dos bases del equipo (tareas diarias
// y gestión de campañas), las mapea a TareaDiaria / CampanaManual, y las
// guarda. Se puede correr en modo dry-run (calcula y no escribe) para
// revisar antes del import real, y es idempotente sobre
// (organizationId, notionPageId) — correrlo dos veces no duplica nada.

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

/** Fecha de una propiedad `date` — día ecuatoriano como marca UTC de medianoche. */
function fechaDe(value: NotionPropertyValue): Date | null {
  const d = value.date as { start: string } | null;
  if (!d?.start) return null;
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(d.start);
  if (soloFecha) return new Date(`${d.start}T00:00:00.000Z`);
  // Datetime completo: se pasa al día ecuatoriano (-5h) antes de tomar la
  // marca de día, mismo criterio que el resto del módulo de Contenido.
  const instante = new Date(d.start);
  const local = new Date(instante.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
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
  numeroCreativos: ["nº de creativos", "n° de creativos", "creativos", "numero de creativos", "número de creativos"],
  estado: ["estado", "status", "situacion", "situación", "etiqueta"],
  etiquetas: ["etiquetas", "tags", "labels"],
  campanaTiktok: ["realizar campañas tiktok", "realizar campanas tiktok", "campañas tiktok", "campanas tiktok"],
  campanaMeta: ["realizar campañas meta", "realizar campanas meta", "campañas meta", "campanas meta"],
  fecha: ["fecha", "dia", "día", "date", "fecha de entrega"],
  notas: ["notas", "observaciones", "comentarios"],
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
    tareas: { creadas: 0, actualizadas: 0, sinProducto: [], sinResponsable: [], sinFecha: 0 },
    campanas: { manualCreadas: 0, manualActualizadas: 0, vinculadas: 0, sinMatch: 0 },
    columnasNoMapeadas: [],
    muestras: [],
  };

  const [products, users, campanasSincronizadas, tareasExistentes, manualesExistentes] = await Promise.all([
    db.product.findMany({ where: { organizationId }, select: { id: true, code: true, name: true } }),
    db.user.findMany({ where: { organizationId }, select: { id: true, name: true, email: true } }),
    db.campaign.findMany({ where: { adAccount: { organizationId } }, select: { id: true, name: true } }),
    db.tareaDiaria.findMany({ where: { organizationId, notionPageId: { not: null } }, select: { notionPageId: true } }),
    db.campanaManual.findMany({ where: { organizationId, notionPageId: { not: null } }, select: { notionPageId: true } }),
  ]);
  const idsTareasExistentes = new Set(tareasExistentes.map((t) => t.notionPageId));
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

  // --- Tareas diarias --------------------------------------------------------
  if (conexion.tareasDatabaseId) {
    const schema = await retrieveDatabase(token, conexion.tareasDatabaseId);
    const { mapeo, sinMapear } = resolverMapeo(schema, CANDIDATOS_TAREAS);
    if (sinMapear.length > 0) reporte.columnasNoMapeadas.push({ base: "tareas", columnas: sinMapear });

    const filas = await queryDatabase(token, conexion.tareasDatabaseId);
    const creadas: Prisma.TareaDiariaCreateManyInput[] = [];

    for (const page of filas) {
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

      const fechaVal = propFecha ? fechaDe(propFecha) : null;
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
        estado: estado.texto ?? "PENDIENTE",
        etiquetas,
        notas: notas.texto,
        origen: "notion",
        notionPageId: page.id,
      };

      if (reporte.muestras.length < 5) reporte.muestras.push({ base: "tareas", ...fila });

      const yaExiste = idsTareasExistentes.has(page.id);
      if (opciones.dryRun) {
        if (yaExiste) reporte.tareas.actualizadas += 1;
        else reporte.tareas.creadas += 1;
        continue;
      }

      if (yaExiste) {
        await db.tareaDiaria.updateMany({ where: { organizationId, notionPageId: page.id }, data: fila });
        reporte.tareas.actualizadas += 1;
      } else {
        creadas.push(fila);
        reporte.tareas.creadas += 1;
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
