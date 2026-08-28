import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";

// Puntaje de desempeño del mes por Editor — pensado para el ranking de los
// 3 mejores (recompensas $100 / $50 / $30, ver spec original). No hay una
// fórmula "oficial" del negocio todavía, así que se pondera lo que ya se
// registra en el pipeline:
//   +1 por cada requerimiento que salió de PENDIENTE (o sea, se trabajó)
//   +2 extra si terminó TESTEADO con CPA igual o mejor que el objetivo del producto
//   -1 si terminó TESTEADO con CPA peor que el objetivo (antes no restaba nada)
//   +1 extra si llegó a un estado terminado en 3 días o menos desde que se creó
//      (turnaround rápido) — se calcula con RequirementActivity, que registra
//      cuándo cambió el estado, no solo el estado final.
// Queda documentado aquí para poder ajustar el peso el día que Fabrizio
// defina un criterio más formal.
const DONE_STATUSES = ["REALIZADO", "EDITADO", "TESTEADO"] as const;
const FAST_TURNAROUND_DAYS = 3;

export type EditorPerformance = {
  userId: string;
  name: string;
  assigned: number;
  completed: number;
  goodPerformance: number;
  badPerformance: number;
  fastTurnaround: number;
  score: number;
};

function monthRange(month?: string) {
  if (!month) return null;
  // month viene como "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return null;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

export async function getEditorPerformance(
  organizationId: string,
  month?: string
): Promise<{ rows: EditorPerformance[]; month: string }> {
  const range = monthRange(month);
  const now = new Date();
  const effectiveMonth = month ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const effectiveRange = range ?? monthRange(effectiveMonth)!;

  const editors = await db.user.findMany({
    where: { organizationId, role: "EDITOR" as Role },
    select: { id: true, name: true },
  });

  const requirements = await db.requirement.findMany({
    where: {
      organizationId,
      ownerId: { in: editors.map((e) => e.id) },
      updatedAt: { gte: effectiveRange.start, lt: effectiveRange.end },
    },
    include: {
      product: { select: { cpaTarget: true } },
      // Primer cambio de estado que llegó a un estado terminado — alcanza
      // para medir turnaround sin traer toda la bitácora.
      activity: {
        where: { action: "STATUS_CHANGE", toValue: { in: [...DONE_STATUSES] } },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  const rows: EditorPerformance[] = editors.map((editor) => {
    const own = requirements.filter((r) => r.ownerId === editor.id);
    const assigned = own.length;
    const completed = own.filter((r) => (DONE_STATUSES as readonly string[]).includes(r.status)).length;
    const goodPerformance = own.filter(
      (r) => r.status === "TESTEADO" && r.cpa != null && r.product && r.cpa <= r.product.cpaTarget
    ).length;
    const badPerformance = own.filter(
      (r) => r.status === "TESTEADO" && r.cpa != null && r.product && r.cpa > r.product.cpaTarget
    ).length;
    const fastTurnaround = own.filter((r) => {
      const firstDone = r.activity[0];
      if (!firstDone) return false;
      const days = (firstDone.createdAt.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      return days <= FAST_TURNAROUND_DAYS;
    }).length;

    const score = completed + goodPerformance * 2 - badPerformance + fastTurnaround;
    return { userId: editor.id, name: editor.name, assigned, completed, goodPerformance, badPerformance, fastTurnaround, score };
  });

  rows.sort((a, b) => b.score - a.score || b.completed - a.completed);

  return { rows, month: effectiveMonth };
}

export const REWARDS = [100, 50, 30];
