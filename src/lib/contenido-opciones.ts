import type { SessionPayload } from "@/lib/auth";

// Opciones, etiquetas y helpers puros del módulo "Contenido" — sin acceso a
// la base. Vive aparte de contenido.ts (que sí toca la base con consultas de
// resumen y rendimiento) para que los componentes de cliente puedan importar
// las listas sin arrastrar Prisma al bundle del navegador. Mismo criterio
// que pipeline-options.ts.

export const PLATAFORMAS = ["TIKTOK", "META", "DRIVE"] as const;
export type PlataformaTarea = (typeof PLATAFORMAS)[number];

export const PLATAFORMA_LABEL: Record<PlataformaTarea, string> = {
  TIKTOK: "TikTok",
  META: "Meta",
  // "Drive" en el vocabulario del equipo no es Google Drive: es contenido
  // adelantado (una campaña ya lista, pendiente de lanzar) o una campaña
  // que ya está montada y solo falta pautar.
  DRIVE: "Drive (adelantado / listo para pautar)",
};

export const ESTADOS_TAREA = [
  "PENDIENTE",
  "EN_PROGRESO",
  "HECHO",
  "NO_CUMPLIDO",
  "POR_PAUTAR",
] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];

export const ESTADO_TAREA_LABEL: Record<EstadoTarea, string> = {
  PENDIENTE: "Pendiente",
  EN_PROGRESO: "En progreso",
  HECHO: "Hecho",
  NO_CUMPLIDO: "No se cumplió",
  POR_PAUTAR: "Por pautar",
};

export const ESTADOS_LOTE = [
  "PLANEADO",
  "EN_PRODUCCION",
  "ENTREGADO",
  "TESTEANDO",
  "CERRADO",
] as const;
export type EstadoLote = (typeof ESTADOS_LOTE)[number];

export const ESTADO_LOTE_LABEL: Record<EstadoLote, string> = {
  PLANEADO: "Planeado",
  EN_PRODUCCION: "En producción",
  ENTREGADO: "Entregado",
  TESTEANDO: "Testeando",
  CERRADO: "Cerrado",
};

export const TAMANOS_LOTE = [6, 12] as const;

/** Los dos estados de Requirement.estado (pipeline-options ESTADOS_CREATIVO)
 * que cuentan como "winner" — para el reporte de producto y el rendimiento
 * por integrante. */
export const ESTADOS_WINNER = ["Winner inicial", "Winner validado"];

/** Quién puede ver/editar una tarea del tablero día a día. */
export function canAccessTarea(session: SessionPayload, tarea: { ownerId: string | null }) {
  return (
    session.role === "OWNER" ||
    session.role === "DIRECTOR" ||
    tarea.ownerId === session.userId
  );
}

// Ecuador es UTC-5 todo el año (sin horario de verano). Mismo desfase fijo
// que ya resuelven src/lib/date-range.ts, src/lib/reporte-horario.ts y
// src/lib/calendario-fechas.ts, cada uno con su propia copia — es el patrón
// establecido en el repo en vez de un helper compartido.
const OFFSET_HORAS = -5;

/** El día de hoy en Ecuador, como marca de medianoche UTC (igual formato que
 * MetricSnapshot.capturedAt / DailyReport.date). Es lo que usan las tareas
 * creadas desde la app — nunca @default(now()), que en las primeras cinco
 * horas del día en Ecuador todavía sería "ayer" en UTC. */
export function localToday(): Date {
  const now = new Date();
  const local = new Date(now.getTime() + OFFSET_HORAS * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}
