// Cliente mínimo de la API de Notion, para el import único de las dos bases
// del equipo (tareas diarias y gestión de campañas). No es un cliente
// general: solo lo que hace falta para leer el esquema de una base y sus
// filas, una vez.
//
// Versión fijada en 2022-06-28 — sigue vigente sin fecha de baja, y es la
// que funciona para bases de una sola tabla (una "data source"), que es el
// caso de las tablas CONTENIDO DEL DÍA.
//
// El "Calendario de contenido Marketing", en cambio, ya está en el formato
// nuevo (varias data sources en una base), y con esa versión Notion se niega a
// consultarlo. Ahí se usa 2025-09-03, que mueve la consulta a
// /v1/data_sources/{id}/query. Ver filasDeBaseNueva.

const BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const NOTION_VERSION_FUENTES = "2025-09-03";

export class NotionError extends Error {}

async function notionFetch<T>(token: string, path: string, body?: unknown, version = NOTION_VERSION): Promise<T> {
  let intentos = 0;
  for (;;) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": version,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 429 && intentos < 5) {
      const espera = Number(res.headers.get("Retry-After") ?? "1");
      await new Promise((r) => setTimeout(r, Math.max(1, espera) * 1000));
      intentos += 1;
      continue;
    }

    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      if (res.status === 404) {
        throw new NotionError(
          "Notion dice que esa base no existe o la integración no tiene acceso a ella. " +
            "Revisa: en Notion, abre la base → ••• (arriba a la derecha) → Connections → agrega la integración."
        );
      }
      if (res.status === 400 && /data source/i.test(texto)) {
        throw new NotionError(
          "Esa base tiene el formato nuevo de Notion (varias data sources en una base) — " +
            "este importador está pensado para una base de tabla simple."
        );
      }
      throw new NotionError(`Notion respondió ${res.status}: ${texto.slice(0, 300)}`);
    }

    return res.json() as Promise<T>;
  }
}

// --- Tipos mínimos de la API (solo lo que se usa) --------------------------

export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "select"
  | "status"
  | "multi_select"
  | "number"
  | "checkbox"
  | "date"
  | "people"
  | "relation"
  | "formula"
  | "rollup"
  | "url"
  | "email"
  | "phone_number"
  | "unique_id"
  | "created_time"
  | "last_edited_time";

export type NotionDatabaseSchema = {
  id: string;
  title: string;
  properties: Record<string, { id: string; type: NotionPropertyType }>;
};

export type NotionPropertyValue = Record<string, unknown>;
export type NotionPage = {
  id: string;
  archived: boolean;
  in_trash?: boolean;
  /**
   * Cuándo se creó la fila.
   *
   * Se usa como fecha de respaldo. Las bases de "CONTENIDO DEL DÍA" no tienen
   * columna de fecha —la fecha ES la base, una por día— así que sin esto todas
   * las tareas entraban sin fecha y el tablero diario quedaba vacío.
   */
  created_time?: string;
  properties: Record<string, NotionPropertyValue>;
};

/**
 * Las bases que la integración puede ver con exactamente este título.
 *
 * Existe por cómo trabaja este equipo: no llevan una base de tareas con una
 * columna de fecha, sino una base NUEVA cada día, todas llamadas igual. Con un
 * solo id configurado se importaba un día y los otros noventa quedaban afuera.
 */
export async function buscarBasesConTitulo(
  token: string,
  titulo: string,
): Promise<{ id: string; titulo: string; editada: string }[]> {
  const encontradas: { id: string; titulo: string; editada: string }[] = [];
  const buscado = titulo.trim().toLowerCase();
  let cursor: string | undefined;

  do {
    const data = await notionFetch<{
      results: {
        id: string;
        object: string;
        last_edited_time: string;
        title?: { plain_text: string }[];
      }[];
      has_more: boolean;
      next_cursor: string | null;
    }>(token, "/search", {
      filter: { value: "database", property: "object" },
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });

    for (const d of data.results) {
      const t = (d.title ?? []).map((x) => x.plain_text).join("").trim();
      if (t.toLowerCase() === buscado) {
        encontradas.push({ id: d.id, titulo: t, editada: d.last_edited_time });
      }
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);

  // De la más reciente a la más vieja: si hay que cortar por cantidad, que se
  // corten los días viejos y no los de esta semana.
  return encontradas.sort((a, b) => b.editada.localeCompare(a.editada));
}

/** Trae el esquema (columnas y tipos) de una base. */
export async function retrieveDatabase(token: string, databaseId: string): Promise<NotionDatabaseSchema> {
  const data = await notionFetch<{
    id: string;
    title: { plain_text: string }[];
    properties: Record<string, { id: string; type: NotionPropertyType }>;
  }>(token, `/databases/${databaseId}`);

  return {
    id: data.id,
    title: data.title.map((t) => t.plain_text).join("") || "(sin título)",
    properties: data.properties,
  };
}

/**
 * Las filas de una base en el formato nuevo de Notion, de todas sus data
 * sources, desde un día en adelante.
 *
 * El filtro por día se hace acá y no en la consulta: la primera versión le
 * pedía a Notion "fecha desde tal día" sobre la primera columna de fecha del
 * esquema, y en el calendario del equipo esa columna no es la que se llena —
 * volvía una sola página de 45 días—. Ahora se trae todo y se mira la primera
 * fecha que tenga dato cada página, o cuándo se creó.
 */
export async function filasDeBaseNueva(
  token: string,
  databaseId: string,
  desdeDia: string,
): Promise<{ paginas: NotionPage[]; fuentes: number; leidas: number }> {
  const baseNueva = await notionFetch<{ data_sources?: { id: string }[] }>(
    token,
    `/databases/${databaseId}`,
    undefined,
    NOTION_VERSION_FUENTES,
  );
  const paginas: NotionPage[] = [];
  const fuentes = baseNueva.data_sources ?? [];
  let leidas = 0;
  for (const fuente of fuentes) {
    let cursor: string | undefined;
    // Tope de páginas por fuente: un calendario de años no se recorre entero
    // cada diez minutos. Se piden de la más nueva a la más vieja.
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const data = await notionFetch<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
        token,
        `/data_sources/${fuente.id}/query`,
        {
          page_size: 100,
          sorts: [{ timestamp: "created_time", direction: "descending" }],
          ...(cursor ? { start_cursor: cursor } : {}),
        },
        NOTION_VERSION_FUENTES,
      );
      for (const p of data.results) {
        leidas += 1;
        if (p.archived || p.in_trash) continue;
        const dia = (primeraFecha(p.properties) ?? p.created_time ?? "").slice(0, 10);
        if (dia && dia >= desdeDia) paginas.push(p);
      }
      cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
      if (!cursor) break;
    }
  }
  return { paginas, fuentes: fuentes.length, leidas };
}

/** Trae TODAS las filas de una base, paginando (con un filtro de Notion opcional). */
export async function queryDatabase(
  token: string,
  databaseId: string,
  filtro?: Record<string, unknown>,
): Promise<NotionPage[]> {
  const paginas: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: NotionPage[];
      has_more: boolean;
      next_cursor: string | null;
    }>(token, `/databases/${databaseId}/query`, {
      page_size: 100,
      ...(filtro ? { filter: filtro } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    for (const p of data.results) {
      if (p.archived || p.in_trash) continue;
      paginas.push(p);
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return paginas;
}

type PadreNotion =
  | { type: "page_id"; page_id: string }
  | { type: "block_id"; block_id: string }
  | { type: "database_id"; database_id: string }
  | { type: "workspace" };

export type PaginaMadre = {
  id: string;
  titulo: string;
  /** El valor crudo de la primera propiedad de fecha con dato ("2026-09-19" o con hora). */
  fecha: string | null;
  /** La base donde vive la página (el calendario), si es una fila de base. */
  baseId: string | null;
};

/**
 * La página donde vive una base: en este equipo, la entrada del calendario
 * "Calendario de contenido Marketing" que contiene la tabla CONTENIDO DEL DÍA.
 *
 * Esa entrada es la que tiene la fecha verdadera del día. La hora de creación
 * de cada fila, que era lo que se usaba, falla en cuanto alguien duplica la
 * tabla de otro día o agrega filas al día siguiente: el lunes 21 aparecían
 * las tareas del fin de semana porque sus filas se habían creado el lunes.
 *
 * Una base insertada dentro de una columna o de un toggle cuelga de un bloque,
 * no de la página: se sube por los bloques hasta dar con ella.
 */
export async function paginaMadreDeBase(token: string, databaseId: string): Promise<PaginaMadre | null> {
  const base = await notionFetch<{ parent?: PadreNotion }>(token, `/databases/${databaseId}`);
  let padre = base.parent;
  for (let nivel = 0; padre && nivel < 5; nivel++) {
    if (padre.type === "block_id") {
      const bloque = await notionFetch<{ parent?: PadreNotion }>(token, `/blocks/${padre.block_id}`);
      padre = bloque.parent;
      continue;
    }
    if (padre.type !== "page_id") return null;
    const pagina = await notionFetch<{ id: string; parent?: PadreNotion; properties: Record<string, NotionPropertyValue> }>(
      token,
      `/pages/${padre.page_id}`,
    );
    return {
      id: pagina.id,
      titulo: tituloDe(pagina.properties),
      fecha: primeraFecha(pagina.properties),
      baseId: pagina.parent?.type === "database_id" ? pagina.parent.database_id : null,
    };
  }
  return null;
}

/** El título de una fila, sea cual sea el nombre de su columna de título. */
export function tituloDe(properties: Record<string, NotionPropertyValue>): string {
  for (const prop of Object.values(properties)) {
    if (prop.type === "title") return ((prop.title as { plain_text: string }[]) ?? []).map((t) => t.plain_text).join("");
  }
  return "";
}

/** El inicio de la primera propiedad de fecha que tenga dato. */
export function primeraFecha(properties: Record<string, NotionPropertyValue>): string | null {
  for (const prop of Object.values(properties)) {
    if (prop.type !== "date") continue;
    const d = prop.date as { start?: string } | null;
    if (d?.start) return d.start;
  }
  return null;
}

export type CasillaNotion = { id: string; texto: string; marcada: boolean };

/**
 * Las casillas (bloques to_do) del cuerpo de una página, en orden.
 *
 * Las páginas "act emi" del calendario no traen tabla: traen una lista "Por
 * hacer" con casillas. Entra también en toggles, columnas y llamadas, que es
 * donde se suelen agrupar; no en subpáginas ni en bases, que son otra cosa.
 */
export async function casillasDePagina(token: string, pageId: string, profundidad = 0): Promise<CasillaNotion[]> {
  const casillas: CasillaNotion[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: { id: string; type: string; has_children?: boolean; to_do?: { checked: boolean; rich_text: { plain_text: string }[] } }[];
      has_more: boolean;
      next_cursor: string | null;
    }>(token, `/blocks/${pageId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    for (const b of data.results) {
      if (b.type === "to_do" && b.to_do) {
        const texto = b.to_do.rich_text.map((t) => t.plain_text).join("").trim();
        if (texto) casillas.push({ id: b.id, texto, marcada: b.to_do.checked });
      }
      const contenedor = ["toggle", "column_list", "column", "callout", "heading_1", "heading_2", "heading_3", "bulleted_list_item", "numbered_list_item", "to_do", "quote"].includes(b.type);
      if (b.has_children && contenedor && profundidad < 3) casillas.push(...(await casillasDePagina(token, b.id, profundidad + 1)));
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return casillas;
}

/** Trae el título de una página (para resolver una propiedad `relation`). */
const cachePaginas = new Map<string, string>();
export async function tituloDePagina(token: string, pageId: string): Promise<string | null> {
  if (cachePaginas.has(pageId)) return cachePaginas.get(pageId) ?? null;
  try {
    const data = await notionFetch<{ properties: Record<string, NotionPropertyValue> }>(
      token,
      `/pages/${pageId}`
    );
    for (const prop of Object.values(data.properties)) {
      if (prop.type === "title") {
        const titulo = ((prop.title as { plain_text: string }[]) ?? []).map((t) => t.plain_text).join("");
        cachePaginas.set(pageId, titulo);
        return titulo || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * El id de una base a partir del link que se pega desde Notion. El id es el
 * segmento de 32 caracteres hexadecimales en la ruta — NO el parámetro
 * "?v=...", que es el de la vista.
 */
export function databaseIdFromUrl(input: string): string | null {
  const limpio = input.trim().split("?")[0];
  const segmento = limpio.split("/").pop() ?? "";
  const hex = segmento.replace(/-/g, "").match(/[0-9a-fA-F]{32}$/)?.[0];
  if (!hex) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
