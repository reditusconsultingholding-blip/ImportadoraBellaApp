// Cliente mínimo de la API de Notion, para el import único de las dos bases
// del equipo (tareas diarias y gestión de campañas). No es un cliente
// general: solo lo que hace falta para leer el esquema de una base y sus
// filas, una vez.
//
// Versión fijada en 2022-06-28 — sigue vigente sin fecha de baja, y es la
// que funciona para bases de una sola tabla (una "data source"), que es el
// caso del equipo. La versión 2025-09-03 mueve la consulta a
// /v1/data_sources/{id}/query cuando una base tiene VARIAS data sources; acá
// no hace falta ese camino.

const BASE_URL = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export class NotionError extends Error {}

async function notionFetch<T>(token: string, path: string, body?: unknown): Promise<T> {
  let intentos = 0;
  for (;;) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
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

/** Trae TODAS las filas de una base, paginando. */
export async function queryDatabase(token: string, databaseId: string): Promise<NotionPage[]> {
  const paginas: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const data = await notionFetch<{
      results: NotionPage[];
      has_more: boolean;
      next_cursor: string | null;
    }>(token, `/databases/${databaseId}/query`, {
      page_size: 100,
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
