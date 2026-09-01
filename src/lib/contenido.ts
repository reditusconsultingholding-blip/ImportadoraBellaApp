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

export type CalendarioContenido = {
  eventos: EventoContenido[];
  /** Cuántas tareas del tablero día a día caen cada día del mes. */
  tareasPorDia: Record<string, number>;
};

export async function calendarioContenido(
  organizationId: string,
  anio: number,
  mes: number
): Promise<CalendarioContenido> {
  const desde = new Date(Date.UTC(anio, mes - 1, 1));
  const hasta = new Date(Date.UTC(anio, mes, 1)); // exclusivo

  const [lotes, tareas] = await Promise.all([
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

  return { eventos, tareasPorDia };
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
};

export async function rendimientoDelEquipo(
  organizationId: string,
  desde: Date,
  hasta: Date,
  verCifras: boolean
): Promise<RendimientoPersona[]> {
  const usuarios = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
    select: { id: true, name: true },
  });

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
      };
    })
    .filter((p) => p.lotes > 0 || p.piezasEntregadas > 0 || p.campanas > 0)
    .sort((a, b) => b.piezasEntregadas - a.piezasEntregadas);
}
