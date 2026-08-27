import { db } from "@/lib/db";

// Nómina semanal. La semana va de lunes a domingo — Fabrizio paga los
// sábados, así que la semana tiene que estar cerrada para entonces.
//
// Tres formas de pago, para no forzar a todo el equipo al mismo molde:
//   SEMANAL   — monto fijo por semana; una ausencia descuenta un día
//   DIARIO    — monto por día; se cobra por los días efectivamente trabajados
//   POR_PIEZA — monto por creativo entregado en la semana (el editor que
//               entrega más, cobra más, sin tener que llevar la cuenta a mano)
//
// Los montos NO viven en el código: los carga quien tenga permiso de nómina
// desde la pantalla, porque cambian y no queremos un deploy por cada ajuste.

export type PayMode = "SEMANAL" | "DIARIO" | "POR_PIEZA";

// Estados que cuentan como "entregado" para el pago por pieza.
const DELIVERED_STATUSES = ["REALIZADO", "EDITADO", "TESTEADO"] as const;

export function startOfWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // getUTCDay(): 0 = domingo. Queremos que la semana arranque el lunes.
  const shift = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - shift);
  return d;
}

export function endOfWeek(weekStart: Date) {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 6);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

export function weekLabel(weekStart: Date) {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(weekStart)} — ${fmt(end)}`;
}

export function weekDays(weekStart: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i);
    return d;
  });
}

export type PayrollLine = {
  employeeId: string;
  userId: string | null;
  fullName: string;
  position: string;
  payMode: PayMode;
  payAmount: number;
  daysPerWeek: number;
  currency: string;
  absenceDates: string[]; // ISO de cada día ausente
  absenceDays: number;
  piecesDelivered: number;
  baseAmount: number;
  absenceDeduct: number;
  total: number;
};

// Calcula lo que corresponde pagar en una semana, sin guardar nada.
// El guardado ocurre solo al cerrar la semana (ver closeWeek).
export async function computeWeek(organizationId: string, weekStart: Date) {
  const weekEnd = endOfWeek(weekStart);

  const employees = await db.employee.findMany({
    where: { organizationId, active: true },
    orderBy: { fullName: "asc" },
    include: {
      absences: { where: { date: { gte: weekStart, lte: weekEnd } } },
    },
  });

  // Piezas entregadas en la semana, por responsable. Se cuenta una sola vez
  // por requerimiento: el estado actual manda, no el historial.
  const userIds = employees.map((e) => e.userId).filter((id): id is string => Boolean(id));
  const delivered = userIds.length
    ? await db.requirement.groupBy({
        by: ["ownerId"],
        where: {
          organizationId,
          ownerId: { in: userIds },
          status: { in: [...DELIVERED_STATUSES] },
          updatedAt: { gte: weekStart, lte: weekEnd },
        },
        _count: { _all: true },
      })
    : [];
  const piecesByUser = new Map(delivered.map((d) => [d.ownerId as string, d._count._all]));

  const lines: PayrollLine[] = employees.map((e) => {
    const absenceDays = e.absences.length;
    const pieces = e.userId ? (piecesByUser.get(e.userId) ?? 0) : 0;
    const days = e.daysPerWeek > 0 ? e.daysPerWeek : 6;

    let baseAmount = 0;
    let absenceDeduct = 0;
    if (e.payMode === "SEMANAL") {
      baseAmount = e.payAmount;
      absenceDeduct = (e.payAmount / days) * absenceDays;
    } else if (e.payMode === "DIARIO") {
      baseAmount = e.payAmount * days;
      absenceDeduct = e.payAmount * absenceDays;
    } else {
      // POR_PIEZA: el pago ya depende de lo entregado, una ausencia no
      // descuenta dos veces.
      baseAmount = e.payAmount * pieces;
      absenceDeduct = 0;
    }

    const total = Math.max(0, round2(baseAmount - absenceDeduct));

    return {
      employeeId: e.id,
      userId: e.userId,
      fullName: e.fullName,
      position: e.position,
      payMode: e.payMode as PayMode,
      payAmount: e.payAmount,
      daysPerWeek: e.daysPerWeek,
      currency: e.currency,
      absenceDates: e.absences.map((a) => a.date.toISOString().slice(0, 10)),
      absenceDays,
      piecesDelivered: pieces,
      baseAmount: round2(baseAmount),
      absenceDeduct: round2(absenceDeduct),
      total,
    };
  });

  const period = await db.payrollPeriod.findUnique({
    where: { organizationId_weekStart: { organizationId, weekStart } },
  });

  return {
    weekStart,
    weekEnd,
    lines,
    total: round2(lines.reduce((sum, l) => sum + l.total, 0)),
    status: period?.status ?? "ABIERTA",
    paidAt: period?.paidAt ?? null,
    paidByName: period?.paidByName ?? null,
  };
}

// Congela la semana: guarda lo calculado en PayrollEntry y la marca pagada.
// Después de esto, cambiar un sueldo ya no reescribe lo que se pagó.
export async function closeWeek(organizationId: string, weekStart: Date, paidByName: string) {
  const computed = await computeWeek(organizationId, weekStart);
  if (computed.status === "PAGADA") return computed;

  const period = await db.payrollPeriod.upsert({
    where: { organizationId_weekStart: { organizationId, weekStart } },
    create: {
      organizationId,
      weekStart,
      weekEnd: computed.weekEnd,
      status: "PAGADA",
      paidAt: new Date(),
      paidByName,
    },
    update: { status: "PAGADA", paidAt: new Date(), paidByName },
  });

  for (const line of computed.lines) {
    await db.payrollEntry.upsert({
      where: { periodId_employeeId: { periodId: period.id, employeeId: line.employeeId } },
      create: {
        periodId: period.id,
        employeeId: line.employeeId,
        baseAmount: line.baseAmount,
        absenceDays: line.absenceDays,
        absenceDeduct: line.absenceDeduct,
        piecesDelivered: line.piecesDelivered,
        total: line.total,
      },
      update: {
        baseAmount: line.baseAmount,
        absenceDays: line.absenceDays,
        absenceDeduct: line.absenceDeduct,
        piecesDelivered: line.piecesDelivered,
        total: line.total,
      },
    });
  }

  return { ...computed, status: "PAGADA" as const, paidAt: period.paidAt, paidByName };
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
