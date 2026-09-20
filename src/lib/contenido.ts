import { db } from "@/lib/db";

// El módulo "Contenido": reemplaza Notion + WhatsApp para la operación diaria
// del equipo creativo. Este archivo tiene lo que toca la base — el resumen
// del día, el calendario y el rendimiento por integrante. Las listas de
// opciones y helpers puros están en contenido-opciones.ts, que se puede
// importar desde el navegador sin arrastrar Prisma.

export * from "@/lib/contenido-opciones";
import { ESTADOS_WINNER } from "@/lib/contenido-opciones";

export type ResumenPersona = {
  userId: string;
  nombre: string;
  tareas: number;
  hechas: number;
  pendientes: number;
  noCumplidas: number;
  porPautar: number;
  creativos: number;
};

export type ResumenDelDia = {
  fecha: string; // ISO del día
  totalTareas: number;
  totalHechas: number;
  totalPendientes: number;
  totalPorPautar: number;
  totalCreativos: number;
  porPersona: ResumenPersona[];
  sinResponsable: number;
};

/**
 * El resumen de un día del tablero, por persona. Lo usa el cierre de día
 * (notificación a Fabricio y Emilia) y la pantalla de tareas.
 */
export async function resumenDelDia(
  organizationId: string,
  dia: Date
): Promise<ResumenDelDia> {
  const tareas = await db.tareaDiaria.findMany({
    where: { organizationId, fecha: dia },
    select: {
      ownerId: true,
      responsableTexto: true,
      estado: true,
      numeroCreativos: true,
      owner: { select: { id: true, name: true } },
    },
  });

  const porPersona = new Map<string, ResumenPersona>();
  let sinResponsable = 0;

  for (const t of tareas) {
    if (!t.ownerId) {
      sinResponsable += 1;
      continue;
    }
    const actual = porPersona.get(t.ownerId) ?? {
      userId: t.ownerId,
      nombre: t.owner?.name ?? t.responsableTexto ?? "Sin nombre",
      tareas: 0,
      hechas: 0,
      pendientes: 0,
      noCumplidas: 0,
      porPautar: 0,
      creativos: 0,
    };
    actual.tareas += 1;
    actual.creativos += t.numeroCreativos;
    if (t.estado === "HECHO") actual.hechas += 1;
    else if (t.estado === "NO_CUMPLIDO") actual.noCumplidas += 1;
    else if (t.estado === "POR_PAUTAR") actual.porPautar += 1;
    else actual.pendientes += 1;
    porPersona.set(t.ownerId, actual);
  }

  return {
    fecha: dia.toISOString(),
    totalTareas: tareas.length,
    totalHechas: tareas.filter((t) => t.estado === "HECHO").length,
    totalPendientes: tareas.filter((t) => t.estado === "PENDIENTE" || t.estado === "EN_PROGRESO").length,
    totalPorPautar: tareas.filter((t) => t.estado === "POR_PAUTAR").length,
    totalCreativos: tareas.reduce((sum, t) => sum + t.numeroCreativos, 0),
    porPersona: [...porPersona.values()].sort((a, b) => b.tareas - a.tareas),
    sinResponsable,
  };
}

// --- Calendario de contenido ----------------------------------------------
//
// A diferencia de EventoCalendario (que guarda INSTANTES reales — ver
// src/lib/calendario-fechas.ts), Ronda.fechaEntrega y TareaDiaria.fecha son
// MARCAS DE DÍA a medianoche UTC, igual que MetricSnapshot.capturedAt: no
// tienen hora, así que no llevan el ajuste de -5h. Por eso el calendario acá
// compara contra límites de mes en UTC llano, no contra limitesDelMesEc.

export type EventoContenido = {
  id: string;
  tipo: "lote";
  dia: string; // "2026-09-01"
  titulo: string;
  subtitulo: string | null;
  estado: string;
  href: string;
};

/** Una persona con trabajo ese día, como etiqueta para el calendario. */
export type EtiquetaDia = {
  id: string;
  /** El nombre de quien lleva las tareas. */
  texto: string;
  /** El estado del conjunto: cerrado, en curso, pendiente o incumplido. */
  estado: string;
  tareas: number;
  hechas: number;
  /** Los productos que toca ese día, para el título al pasar el mouse. */
  detalle: string;
};

export type CalendarioContenido = {
  eventos: EventoContenido[];
  /** Cuántas tareas del tablero día a día caen cada día del mes. */
  tareasPorDia: Record<string, number>;
  /**
   * Quién tiene trabajo cada día, una etiqueta por persona.
   *
   * Primero fue el conteo ("7 tareas"), que no dice nada. Después una etiqueta
   * por tarea con el nombre del producto, que llenaba la casilla: un día con
   * treinta piezas mostraba seis productos sueltos y "+24 más".
   *
   * Lo que se mira en un calendario de equipo es quién está cargado, no qué
   * producto se toca —eso ya está en Requerimientos—. Así que cada día trae
   * una etiqueta por persona con cuántas lleva y cuántas cerró, y el detalle
   * completo se abre tocando el día.
   */
  etiquetasPorDia: Record<string, EtiquetaDia[]>;
  /**
   * Las actividades de la gente, además del contenido.
   *
   * Emilia lo marcó en la reunión: el calendario mostraba solo el contenido
   * del día y "no aparece para nada lo mío". Son los eventos del calendario de
   * la empresa —reuniones, grabaciones, entregas, lo que cada quien agenda—,
   * que ya existían en el chat pero no se veían acá.
   */
  actividadesPorDia: Record<string, ActividadDia[]>;
};

export type ActividadDia = {
  id: string;
  titulo: string;
  hora: string | null;
  quien: string;
};

export async function calendarioContenido(
  organizationId: string,
  anio: number,
  mes: number
): Promise<CalendarioContenido> {
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(anio, mes, 1)); // exclusivo

  const [lotes, tareas, detalle, actividades] = await Promise.all([
    db.ronda.findMany({
      where: { organizationId, fechaEntrega: { gte: desde, lt: hasta } },
      orderBy: { fechaEntrega: "asc" },
      select: {
        id: true,
        numero: true,
        nomenclatura: true,
        fechaEntrega: true,
        estado: true,
        responsable: { select: { name: true } },
        product: { select: { code: true, name: true } },
      },
    }),
    db.tareaDiaria.groupBy({
      by: ["fecha"],
      where: { organizationId, fecha: { gte: desde, lt: hasta } },
      _count: { _all: true },
    }),
    // Las tareas en sí, para poder pintarlas como etiquetas dentro del día.
    db.tareaDiaria.findMany({
      where: { organizationId, fecha: { gte: desde, lt: hasta } },
      orderBy: [{ fecha: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        fecha: true,
        estado: true,
        productoTexto: true,
        product: { select: { name: true } },
        owner: { select: { name: true } },
        responsableTexto: true,
      },
    }),
    // Los eventos del mes, con un día de margen a cada lado: el inicio es un
    // instante y un evento a las 20:00 de Ecuador del último día ya cae en el
    // mes siguiente en UTC.
    db.eventoCalendario.findMany({
      where: {
        organizationId,
        inicio: { gte: new Date(desde.getTime() - 86400_000), lt: new Date(hasta.getTime() + 86400_000) },
      },
      orderBy: { inicio: "asc" },
      select: {
        id: true,
        titulo: true,
        inicio: true,
        todoElDia: true,
        creadoPor: { select: { name: true } },
      },
    }),
  ]);

  const eventos: EventoContenido[] = lotes
    .filter((l) => l.fechaEntrega)
    .map((l) => ({
      id: l.id,
      tipo: "lote" as const,
      dia: (l.fechaEntrega as Date).toISOString().slice(0, 10),
      titulo: `${l.nomenclatura ?? `Lote ${l.numero}`} — ${l.product.name}`,
      subtitulo: l.responsable?.name ?? null,
      estado: l.estado,
      href: `/dashboard/productos/${encodeURIComponent(l.product.code)}?vista=rondas`,
    }));

  const tareasPorDia: Record<string, number> = {};
  for (const t of tareas) {
    if (!t.fecha) continue;
    tareasPorDia[t.fecha.toISOString().slice(0, 10)] = t._count._all;
  }

  // Una etiqueta por persona y por día. El estado del conjunto sigue la regla
  // del semáforo: si algo quedó sin cumplir manda el rojo, si todo está
  // cerrado manda el verde, y en el medio está lo que está en curso.
  const porDiaYPersona = new Map<string, Map<string, EtiquetaDia & { productos: Set<string> }>>();
  for (const t of detalle) {
    if (!t.fecha) continue;
    const dia = t.fecha.toISOString().slice(0, 10);
    const quien = t.owner?.name ?? t.responsableTexto ?? "Sin responsable";
    const personas = porDiaYPersona.get(dia) ?? new Map();
    const e = personas.get(quien) ?? {
      id: `${dia}:${quien}`,
      texto: quien.split(" ")[0],
      estado: "HECHO",
      tareas: 0,
      hechas: 0,
      detalle: "",
      productos: new Set<string>(),
    };
    e.tareas += 1;
    if (t.estado === "HECHO") e.hechas += 1;
    e.estado =
      e.estado === "NO_CUMPLIDO" || t.estado === "NO_CUMPLIDO"
        ? "NO_CUMPLIDO"
        : e.estado === "EN_PROGRESO" || t.estado === "EN_PROGRESO"
          ? "EN_PROGRESO"
          : t.estado === "HECHO" && e.estado === "HECHO"
            ? "HECHO"
            : "PENDIENTE";
    e.productos.add(t.product?.name ?? t.productoTexto ?? "Sin producto");
    personas.set(quien, e);
    porDiaYPersona.set(dia, personas);
  }

  const etiquetasPorDia: Record<string, EtiquetaDia[]> = {};
  for (const [dia, personas] of porDiaYPersona) {
    etiquetasPorDia[dia] = [...personas.values()]
      .sort((a, b) => b.tareas - a.tareas || a.texto.localeCompare(b.texto))
      .map(({ productos, ...e }) => ({ ...e, detalle: [...productos].join(" · ") }));
  }

  // El día y la hora de Ecuador de cada evento: el inicio es un instante.
  const actividadesPorDia: Record<string, ActividadDia[]> = {};
  for (const a of actividades) {
    const local = new Date(a.inicio.getTime() - 5 * 3600_000);
    const clave = local.toISOString().slice(0, 10);
    if (clave < desde.toISOString().slice(0, 10) || clave >= hasta.toISOString().slice(0, 10)) continue;
    (actividadesPorDia[clave] ??= []).push({
      id: a.id,
      titulo: a.titulo,
      hora: a.todoElDia ? null : local.toISOString().slice(11, 16),
      quien: a.creadoPor.name.split(" ")[0],
    });
  }

  return { eventos, tareasPorDia, etiquetasPorDia, actividadesPorDia };
}

// --- Rendimiento por integrante --------------------------------------------
//
// La cadena de atribución: Ronda (lote, responsableId, nomenclatura) →
// Requirement.rondaId (piezas del lote) → nombre de campaña con esa
// nomenclatura → Campaign.rondaId (lo setea el sync, ver windsor-sync.ts) →
// MetricSnapshot (gasto, CPA, compras). Con eso se puede responder "quién
// hizo esta campaña" y "qué rendimiento tiene cada integrante" — que es todo
// el sentido de la nomenclatura por lote.

const DELIVERED_STATUSES = ["REALIZADO", "EDITADO", "TESTEADO"];

export type RendimientoPersona = {
  userId: string;
  nombre: string;
  lotes: number;
  piezasEntregadas: number;
  winners: number;
  campanas: number;
  gastoTotal: number | null;
  compras: number;
  cpaPromedio: number | null;
  mejorProducto: string | null;
  peorProducto: string | null;
  /**
   * Lo que pidió Emilia para esta pantalla, sacado de Requerimientos y no del
   * día a día: cuántas piezas tiene cada persona en el período, cuántas siguen
   * abiertas y cuántas no clasificó. Es lo mismo que le llega a las ocho, pero
   * acumulado y lado a lado con el resto del equipo.
   */
  piezasDelPeriodo: number;
  pendientes: number;
  sinClasificar: number;
  /**
   * El día a día, que es donde de verdad se reparte el trabajo.
   *
   * Requerimientos guarda las PIEZAS y buena parte vino de una importación sin
   * responsable; el tablero del día a día es lo que el equipo carga a mano
   * todas las mañanas. Un reporte de rendimiento que solo mirara las piezas
   * mostraba ceros para todo el mundo, que es peor que no mostrar nada: se lee
   * como "nadie trabajó".
   */
  tareas: number;
  tareasHechas: number;
  tareasIncumplidas: number;
  creativos: number;
  /** Los productos que lleva, según PRODUCTOS ORDEN de Notion. */
  productosACargo: string[];
};

export async function rendimientoDelEquipo(
  organizationId: string,
  desde: Date,
  hasta: Date,
  verCifras: boolean
): Promise<RendimientoPersona[]> {
  const usuarios = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
    select: { id: true, name: true, apodos: true },
  });

  // Las piezas del período, por persona, para contar abiertas y sin clasificar.
  // `date` es un instante: el período va de la medianoche de Ecuador del
  // primer día a la del día siguiente al último.
  const inicio = new Date(desde.getTime() + 5 * 3600_000);
  const fin = new Date(hasta.getTime() + 29 * 3600_000);
  const [delPeriodo, aCargo, tareas] = await Promise.all([
    db.requirement.findMany({
      where: { organizationId, ownerId: { not: null }, date: { gte: inicio, lt: fin } },
      select: {
        ownerId: true,
        status: true,
        adType: true,
        phase: true,
        visualFormat: true,
        angle: true,
        awarenessLevel: true,
        marketOrigin: true,
      },
    }),
    db.responsableProducto.findMany({
      where: { product: { organizationId, archived: false } },
      select: { userId: true, product: { select: { name: true } } },
    }),
    // El día a día. `fecha` es marca de día a medianoche UTC, así que se
    // compara contra los límites tal cual, sin el ajuste de -5h.
    db.tareaDiaria.findMany({
      where: { organizationId, fecha: { gte: desde, lte: hasta } },
      select: { ownerId: true, responsableTexto: true, estado: true, numeroCreativos: true },
    }),
  ]);
  const ABIERTOS = new Set(["PENDIENTE", "EN_EDICION", "LISTO_PARA_REVISAR"]);
  const porPersona = new Map<string, { total: number; pendientes: number; sinClasificar: number }>();
  for (const r of delPeriodo) {
    const a = porPersona.get(r.ownerId!) ?? { total: 0, pendientes: 0, sinClasificar: 0 };
    a.total += 1;
    if (ABIERTOS.has(r.status)) a.pendientes += 1;
    if ([r.adType, r.phase, r.visualFormat, r.angle, r.awarenessLevel, r.marketOrigin].some((x) => !x?.trim())) {
      a.sinClasificar += 1;
    }
    porPersona.set(r.ownerId!, a);
  }
  const productosDe = new Map<string, string[]>();
  for (const x of aCargo) productosDe.set(x.userId, [...(productosDe.get(x.userId) ?? []), x.product.name]);

  // Las tareas por persona. Muchas filas del tablero traen el nombre escrito a
  // mano y no el usuario enlazado —así se cargaban antes de que el tablero
  // tuviera responsable—, así que se cruza también por nombre; si no coincide
  // con nadie, la tarea no se le cuenta a ninguno.
  const porNombre = new Map<string, string>();
  for (const u of usuarios) {
    porNombre.set(u.name.trim().toLowerCase(), u.id);
    for (const apodo of u.apodos) porNombre.set(apodo.trim().toLowerCase(), u.id);
    const pila = u.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (pila && !porNombre.has(pila)) porNombre.set(pila, u.id);
  }
  const tareasDe = new Map<string, { tareas: number; hechas: number; incumplidas: number; creativos: number }>();
  for (const t of tareas) {
    const id = t.ownerId ?? porNombre.get((t.responsableTexto ?? "").trim().toLowerCase()) ?? null;
    if (!id) continue;
    const a = tareasDe.get(id) ?? { tareas: 0, hechas: 0, incumplidas: 0, creativos: 0 };
    a.tareas += 1;
    if (t.estado === "HECHO") a.hechas += 1;
    if (t.estado === "NO_CUMPLIDO") a.incumplidas += 1;
    a.creativos += t.numeroCreativos ?? 0;
    tareasDe.set(id, a);
  }

  const [piezas, winners, lotes, campanasConRonda] = await Promise.all([
    db.requirement.groupBy({
      by: ["ownerId"],
      where: { organizationId, ownerId: { not: null }, status: { in: DELIVERED_STATUSES as never[] }, updatedAt: { gte: desde, lte: hasta } },
      _count: { _all: true },
    }),
    db.requirement.groupBy({
      by: ["ownerId"],
      where: { organizationId, ownerId: { not: null }, estado: { in: ESTADOS_WINNER }, updatedAt: { gte: desde, lte: hasta } },
      _count: { _all: true },
    }),
    db.ronda.groupBy({
      by: ["responsableId"],
      where: { organizationId, responsableId: { not: null }, fecha: { gte: desde, lte: hasta } },
      _count: { _all: true },
    }),
    db.campaign.findMany({
      where: { ronda: { organizationId, responsableId: { not: null } } },
      select: {
        ronda: { select: { responsableId: true, product: { select: { name: true } } } },
        metrics: { where: { capturedAt: { gte: desde, lte: hasta } }, select: { spend: true, purchases: true } },
      },
    }),
  ]);

  const piezasPorUser = new Map(piezas.map((p) => [p.ownerId as string, p._count._all]));
  const winnersPorUser = new Map(winners.map((w) => [w.ownerId as string, w._count._all]));
  const lotesPorUser = new Map(lotes.map((l) => [l.responsableId as string, l._count._all]));

  // Por usuario: campañas, gasto, compras y desempeño por producto (para
  // elegir mejor/peor por desvío de compras — sin CPA objetivo a mano acá,
  // "mejor" es el producto con más compras y "peor" el de más gasto sin
  // compras).
  type Acumulado = { campanas: number; gasto: number; compras: number; porProducto: Map<string, { compras: number; gasto: number }> };
  const porUsuario = new Map<string, Acumulado>();
  for (const c of campanasConRonda) {
    const responsableId = c.ronda?.responsableId;
    if (!responsableId) continue;
    const gasto = c.metrics.reduce((s, m) => s + m.spend, 0);
    const compras = c.metrics.reduce((s, m) => s + m.purchases, 0);
    if (gasto === 0 && compras === 0) continue;
    const acc = porUsuario.get(responsableId) ?? { campanas: 0, gasto: 0, compras: 0, porProducto: new Map() };
    acc.campanas += 1;
    acc.gasto += gasto;
    acc.compras += compras;
    const nombreProducto = c.ronda?.product.name ?? "Sin producto";
    const pp = acc.porProducto.get(nombreProducto) ?? { compras: 0, gasto: 0 };
    pp.compras += compras;
    pp.gasto += gasto;
    acc.porProducto.set(nombreProducto, pp);
    porUsuario.set(responsableId, acc);
  }

  return usuarios
    .map((u): RendimientoPersona => {
      const acc = porUsuario.get(u.id);
      const productos = acc ? [...acc.porProducto.entries()] : [];
      const mejor = productos.length > 0 ? [...productos].sort((a, b) => b[1].compras - a[1].compras)[0] : null;
      const peor = productos.length > 1 ? [...productos].sort((a, b) => b[1].gasto - a[1].gasto)[0] : null;
      return {
        userId: u.id,
        nombre: u.name,
        lotes: lotesPorUser.get(u.id) ?? 0,
        piezasEntregadas: piezasPorUser.get(u.id) ?? 0,
        winners: winnersPorUser.get(u.id) ?? 0,
        campanas: acc?.campanas ?? 0,
        gastoTotal: verCifras ? (acc?.gasto ?? 0) : null,
        compras: acc?.compras ?? 0,
        cpaPromedio: verCifras && acc && acc.compras > 0 ? acc.gasto / acc.compras : null,
        mejorProducto: mejor?.[0] ?? null,
        peorProducto: peor?.[0] ?? null,
        piezasDelPeriodo: porPersona.get(u.id)?.total ?? 0,
        pendientes: porPersona.get(u.id)?.pendientes ?? 0,
        sinClasificar: porPersona.get(u.id)?.sinClasificar ?? 0,
        tareas: tareasDe.get(u.id)?.tareas ?? 0,
        tareasHechas: tareasDe.get(u.id)?.hechas ?? 0,
        tareasIncumplidas: tareasDe.get(u.id)?.incumplidas ?? 0,
        creativos: tareasDe.get(u.id)?.creativos ?? 0,
        productosACargo: (productosDe.get(u.id) ?? []).sort(),
      };
    })
    .filter(
      (p) =>
        p.lotes > 0 ||
        p.piezasEntregadas > 0 ||
        p.campanas > 0 ||
        p.piezasDelPeriodo > 0 ||
        p.tareas > 0 ||
        p.productosACargo.length > 0,
    )
    .sort(
      (a, b) =>
        b.tareas - a.tareas || b.piezasDelPeriodo - a.piezasDelPeriodo || b.piezasEntregadas - a.piezasEntregadas,
    );
}

/**
 * Los nombres del día a día que no son de nadie.
 *
 * El tablero permite escribir el responsable a mano, y así entraron 170
 * tareas a nombre de "MAJO" que en el reporte no se le contaban a María José:
 * aparecía en cero habiendo trabajado todo el mes. En vez de adivinar, se
 * muestran acá para que dirección los anote como apodo en Usuarios.
 */
export async function nombresSinEnlazar(organizationId: string, desde: Date, hasta: Date) {
  const [usuarios, tareas] = await Promise.all([
    db.user.findMany({
      where: { organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
      select: { name: true, apodos: true },
    }),
    db.tareaDiaria.findMany({
      where: { organizationId, ownerId: null, fecha: { gte: desde, lte: hasta } },
      select: { responsableTexto: true },
    }),
  ]);

  const conocidos = new Set<string>();
  for (const u of usuarios) {
    conocidos.add(u.name.trim().toLowerCase());
    for (const a of u.apodos) conocidos.add(a.trim().toLowerCase());
    const pila = u.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (pila) conocidos.add(pila);
  }

  const cuenta = new Map<string, number>();
  for (const t of tareas) {
    const texto = (t.responsableTexto ?? "").trim();
    if (!texto || conocidos.has(texto.toLowerCase())) continue;
    cuenta.set(texto, (cuenta.get(texto) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .map(([nombre, tareas]) => ({ nombre, tareas }))
    .sort((a, b) => b.tareas - a.tareas);
}
