import { db } from "@/lib/db";
import { normalizarNombre } from "@/lib/enlace-shopify";
import { fetchConReintentos } from "@/lib/http";

// Los pedidos del equipo de ventas, traídos de su planilla de Google.
//
// QUÉ PROBLEMA RESUELVE
// El control publicitario contaba los pedidos desde Shopify. Se le acerca al
// número del equipo pero no es el mismo —en agosto, 11.804 contra 11.753— y
// Emilia discute con el suyo: buena parte de los pedidos entra por Funnelish y
// el equipo los anota a mano, con sus propios estados. Mientras las dos cifras
// no coincidan al pedido, la pantalla no sirve para decidir nada.
//
// CÓMO SE LEE LA PLANILLA
// Está compartida como "cualquiera con el enlace", así que se lee sin
// credenciales ni cuenta de servicio: basta pedirle el CSV a Google. No se
// escribe NADA en ella; el equipo la sigue usando como siempre.
//
// El endpoint bueno es `export?format=csv&gid=N`, que devuelve la pestaña
// entera. El otro que anda dando vueltas por internet —`gviz/tq`— ignora el
// parámetro `sheet` y corta a las primeras seiscientas filas: devolvía la
// pestaña equivocada, recortada, sin avisar. Para saber qué `gid` tiene cada
// pestaña se lee la página `htmlview`, que las lista.
//
// LA REGLA DE CONTEO, VERIFICADA
// Un pedido es UNA FILA, no la suma de la columna CANTIDAD, y cuentan todos
// los estados —cancelados incluidos—. Contado así, del 1 al 21 de septiembre
// da 104 pedidos de "Cepillo de inodoro desechable" y 136 de "Shampoo aceite
// de batana", que son exactamente los números que el equipo lee en su
// planilla. Sumando unidades darían 261 y 342.

/** El libro de Importadora Bella, cuando la organización no tiene otro puesto. */
const HOJA_POR_DEFECTO = "1UA-M9hP1VRQUUixuqQDa6_nRwe2V0Vb3csQry8HHkcc";

const MESES = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
] as const;

/**
 * Una pestaña de mes: "SEPTIEMBRE", "OCTUBRE 2026", "septiembre".
 *
 * Se aceptan variantes porque la pestaña la crea una persona cada mes y nadie
 * garantiza que la escriba igual que la anterior. Lo que NO entra son las
 * pestañas de porcentajes —"SEPTIEMBRE%"— que son tablas dinámicas ya
 * calculadas: de ahí no salen pedidos, salen resúmenes.
 */
function esPestanaDeMes(nombre: string): boolean {
  const limpio = nombre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .trim();
  if (limpio.includes("%")) return false;
  return MESES.some((m) => limpio === m || new RegExp(`^${m}\\s*\\d{0,4}$`).test(limpio));
}

/* --------------------------------- CSV ----------------------------------- */

/**
 * Parser de CSV con comillas.
 *
 * Hace falta uno de verdad y no un `split(",")`: la columna de dirección trae
 * comas adentro —"Ernesto castro y carlos Molina, atrás del Aki"— y partir por
 * comas corre todas las columnas de ese renglón. El pedido terminaría contado
 * con el nombre del asesor como producto.
 */
export function filasDeCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let entreComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        // Dos comillas seguidas son una comilla literal, no el cierre.
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        celda += c;
      }
      continue;
    }
    if (c === '"') entreComillas = true;
    else if (c === ",") {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else if (c !== "\r") celda += c;
  }
  if (celda !== "" || fila.length > 0) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** `dd/mm/aaaa` a marca de día a medianoche UTC. Cualquier otra cosa, null. */
export function fechaDelReporte(texto: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  // Un 31 de abril se convierte solo en el 1 de mayo: se descarta en vez de
  // dejar que un error de tipeo mueva pedidos de mes.
  if (d.getUTCDate() !== dia || d.getUTCMonth() !== mes - 1) return null;
  return d;
}

/* ------------------------------ La planilla ------------------------------- */

export type PestanaDelLibro = { nombre: string; gid: string };

/**
 * Las pestañas del libro, con su gid.
 *
 * Salen de la página `htmlview`, que las lista en un `items.push({name, gid})`.
 * Es la única forma de saber el gid sin pedirle credenciales a nadie — y hace
 * falta el gid porque es lo único que el endpoint de CSV entiende.
 */
export async function pestanasDelLibro(hojaId: string): Promise<PestanaDelLibro[]> {
  const res = await fetchConReintentos(
    `https://docs.google.com/spreadsheets/d/${hojaId}/htmlview`,
    { headers: { Accept: "text/html" } },
    { timeoutMs: 30_000, reintentos: 1 },
  );
  if (!res.ok) throw new Error(`Google respondió ${res.status} al listar las pestañas.`);
  const html = await res.text();

  const pestanas: PestanaDelLibro[] = [];
  const vistos = new Set<string>();
  const re = /items\.push\(\{name:\s*"([^"]+)"[^}]*?gid:\s*"(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (vistos.has(m[2])) continue;
    vistos.add(m[2]);
    pestanas.push({ nombre: m[1], gid: m[2] });
  }
  return pestanas;
}

/** El CSV completo de una pestaña. */
async function csvDePestana(hojaId: string, gid: string): Promise<string> {
  const res = await fetchConReintentos(
    `https://docs.google.com/spreadsheets/d/${hojaId}/export?format=csv&gid=${gid}`,
    { headers: { Accept: "text/csv" } },
    { timeoutMs: 60_000, reintentos: 1 },
  );
  if (!res.ok) throw new Error(`Google respondió ${res.status} al bajar la pestaña ${gid}.`);
  return res.text();
}

/* ------------------------------- El conteo -------------------------------- */

export type PedidoContado = {
  fecha: Date;
  productoTexto: string;
  productoNorm: string;
  pedidos: number;
  unidades: number;
  confirmados: number;
  pendientes: number;
  cancelados: number;
  reagendados: number;
  otros: number;
};

/** Dónde están FECHA, PRODUCTO, CANTIDAD y ESTADO en esta pestaña. */
function columnas(encabezado: string[]) {
  const buscar = (...nombres: string[]) =>
    encabezado.findIndex((h) => {
      const limpio = h
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toUpperCase()
        .trim();
      return nombres.includes(limpio);
    });
  return {
    fecha: buscar("FECHA"),
    producto: buscar("PRODUCTO"),
    cantidad: buscar("CANTIDAD"),
    // Las pestañas viejas llaman ESTADO a la columna "CONFIRMADO". Es la
    // misma: el estado del pedido.
    estado: buscar("ESTADO", "CONFIRMADO"),
  };
}

/** Agrupa las filas de una pestaña por día y por nombre de producto. */
export function contarPestana(csv: string): PedidoContado[] {
  const filas = filasDeCsv(csv);
  if (filas.length < 2) return [];

  const col = columnas(filas[0]);
  if (col.fecha < 0 || col.producto < 0) return [];

  const acumulado = new Map<string, PedidoContado>();

  for (const fila of filas.slice(1)) {
    const fecha = fechaDelReporte(fila[col.fecha] ?? "");
    if (!fecha) continue;
    const texto = (fila[col.producto] ?? "").trim();
    if (!texto) continue;
    const norm = normalizarNombre(texto);
    if (!norm) continue;

    const clave = `${fecha.toISOString()}|${norm}`;
    const fila2 = acumulado.get(clave) ?? {
      fecha,
      productoTexto: texto,
      productoNorm: norm,
      pedidos: 0,
      unidades: 0,
      confirmados: 0,
      pendientes: 0,
      cancelados: 0,
      reagendados: 0,
      otros: 0,
    };

    fila2.pedidos += 1;
    const cantidad = Number((fila[col.cantidad] ?? "").replace(",", "."));
    fila2.unidades += Number.isFinite(cantidad) && cantidad > 0 ? Math.round(cantidad) : 0;

    const estado = (fila[col.estado] ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase()
      .trim();
    if (estado.startsWith("CONFIRMADO")) fila2.confirmados += 1;
    else if (estado.startsWith("PENDIENTE")) fila2.pendientes += 1;
    else if (estado.startsWith("CANCELADO")) fila2.cancelados += 1;
    else if (estado.startsWith("REAGENDADO")) fila2.reagendados += 1;
    else fila2.otros += 1;

    acumulado.set(clave, fila2);
  }

  return [...acumulado.values()];
}

/* ------------------------------ La escritura ------------------------------ */

export type ResultadoSync = {
  pestanas: string[];
  dias: number;
  filas: number;
  /** Pestañas que se saltaron porque no cambió nada desde la última vuelta. */
  sinCambios: string[];
  error?: string;
};

/**
 * Trae la planilla entera y deja los pedidos guardados.
 *
 * NUNCA BORRA UN MES QUE YA NO ESTÁ EN LA PLANILLA. El equipo elimina de ahí
 * los meses de más de dos meses para que el archivo no pese, y si el control
 * se rigiera por lo que hay hoy, cada dos meses se evaporaría un mes cerrado y
 * los informes viejos cambiarían solos. Se reescriben únicamente los días que
 * la pestaña trae.
 */
export async function sincronizarReporteVentas(organizationId: string): Promise<ResultadoSync> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { reporteHojaId: true },
  });
  const hojaId = org?.reporteHojaId?.trim() || HOJA_POR_DEFECTO;

  const todas = await pestanasDelLibro(hojaId);
  const meses = todas.filter((p) => esPestanaDeMes(p.nombre));
  if (meses.length === 0) {
    return { pestanas: [], dias: 0, filas: 0, sinCambios: [], error: "No se encontró ninguna pestaña de mes." };
  }

  const resultado: ResultadoSync = { pestanas: [], dias: 0, filas: 0, sinCambios: [] };

  for (const pestana of meses) {
    const csv = await csvDePestana(hojaId, pestana.gid);
    const contadas = contarPestana(csv);
    if (contadas.length === 0) continue;

    // Los días que esta pestaña cubre. Solo esos se reescriben.
    const dias = [...new Set(contadas.map((c) => c.fecha.toISOString()))].map((s) => new Date(s));

    // Antes de tocar la base se compara con lo guardado. La planilla cambia
    // unas pocas filas por hora —los pedidos del día— y reescribir catorce mil
    // renglones cada vuelta por gusto es la forma más rápida de agotar las
    // conexiones de Supabase.
    const previas = await db.pedidoReporte.findMany({
      where: { organizationId, fecha: { in: dias } },
      select: {
        fecha: true,
        productoNorm: true,
        pedidos: true,
        unidades: true,
        confirmados: true,
        pendientes: true,
        cancelados: true,
        reagendados: true,
        otros: true,
      },
    });
    const firma = (c: {
      fecha: Date;
      productoNorm: string;
      pedidos: number;
      unidades: number;
      confirmados: number;
      pendientes: number;
      cancelados: number;
      reagendados: number;
      otros: number;
    }) =>
      [
        c.fecha.toISOString(),
        c.productoNorm,
        c.pedidos,
        c.unidades,
        c.confirmados,
        c.pendientes,
        c.cancelados,
        c.reagendados,
        c.otros,
      ].join("|");

    const antes = new Set(previas.map(firma));
    const ahora = contadas.map(firma);
    const igual = antes.size === ahora.length && ahora.every((f) => antes.has(f));
    if (igual) {
      resultado.sinCambios.push(pestana.nombre);
      continue;
    }

    await db.$transaction([
      db.pedidoReporte.deleteMany({ where: { organizationId, fecha: { in: dias } } }),
      db.pedidoReporte.createMany({
        data: contadas.map((c) => ({
          organizationId,
          fecha: c.fecha,
          productoTexto: c.productoTexto,
          productoNorm: c.productoNorm,
          pedidos: c.pedidos,
          unidades: c.unidades,
          confirmados: c.confirmados,
          pendientes: c.pendientes,
          cancelados: c.cancelados,
          reagendados: c.reagendados,
          otros: c.otros,
          hoja: pestana.nombre,
        })),
      }),
    ]);

    resultado.pestanas.push(pestana.nombre);
    resultado.dias += dias.length;
    resultado.filas += contadas.length;
  }

  return resultado;
}
