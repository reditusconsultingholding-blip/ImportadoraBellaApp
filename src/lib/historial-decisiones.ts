import { db } from "@/lib/db";
import type { EntradaHistorial } from "@/lib/historial-formato";

// La trazabilidad de un producto: qué se le propuso a dirección, quién lo
// pidió, qué se decidió y con qué nota.
//
// Existe porque las propuestas viven en DOS tablas distintas y hasta ahora
// nadie las veía juntas: `ProductAction`, que es lo que propone el equipo desde
// Productos, y `PendingAction`, que es lo que propone Jarvis sobre una campaña.
// Mirar solo una de las dos daba una historia incompleta del mismo producto —
// "nunca se propuso pausar esto" cuando Jarvis lo había propuesto y alguien lo
// había rechazado.

const TIPO_PRODUCTO: Record<string, string> = {
  MAS_CREATIVOS: "Creativos nuevos",
  ESCALAR: "Escalar",
  PAUSAR: "Pausar",
  REVISAR_OFERTA: "Revisar oferta",
};

const TIPO_JARVIS: Record<string, string> = {
  PAUSE_CAMPAIGN: "Pausar",
  RESUME_CAMPAIGN: "Reanudar",
  SCALE_BUDGET: "Escalar",
};

const plata = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

/** Qué proponía Jarvis, en palabras. El payload es JSON libre y puede venir roto. */
function detalleJarvis(tipo: string, payload: string, campana: string): string {
  if (tipo === "PAUSE_CAMPAIGN") return `Pausar la campaña ${campana}`;
  if (tipo === "RESUME_CAMPAIGN") return `Reanudar la campaña ${campana}`;

  let diario: number | null = null;
  try {
    const p = JSON.parse(payload) as { dailyBudget?: unknown };
    if (typeof p.dailyBudget === "number" && Number.isFinite(p.dailyBudget)) diario = p.dailyBudget;
  } catch {
    // Un payload ilegible no puede tumbar el historial: se muestra la propuesta
    // sin el monto, que es peor que tenerlo pero mucho mejor que no ver nada.
  }

  return diario == null
    ? `Cambiar el presupuesto de ${campana}`
    : `Subir el presupuesto de ${campana} a ${plata(diario)} al día`;
}

export async function getHistorialDecisiones(
  organizationId: string,
  productId: string
): Promise<EntradaHistorial[]> {
  const [acciones, propuestasJarvis] = await Promise.all([
    db.productAction.findMany({
      // La organización va en el WHERE y no en un `if` posterior: traer la fila
      // y compararla después deja abierta la ventana de leer lo ajeno.
      where: { organizationId, productId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        kind: true,
        detail: true,
        cantidad: true,
        reason: true,
        status: true,
        decisionNote: true,
        createdAt: true,
        decidedAt: true,
        proposedBy: { select: { name: true } },
        decidedBy: { select: { name: true } },
        assignee: { select: { name: true } },
        _count: { select: { requirements: true } },
      },
    }),
    // `PendingAction` no guarda la organización: cuelga de la campaña, que
    // cuelga de la cuenta publicitaria. El filtro anidado lo resuelve en la
    // misma consulta, sin traer nada de otra organización a memoria.
    db.pendingAction.findMany({
      where: { campaign: { productId, adAccount: { organizationId } } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        type: true,
        payload: true,
        reason: true,
        status: true,
        requestedBy: true,
        createdAt: true,
        resolvedAt: true,
        approvedBy: { select: { name: true } },
        campaign: { select: { name: true } },
      },
    }),
  ]);

  // `requestedBy` es texto suelto: "jarvis" o el id de una persona, sin
  // relación que lo respalde. Se resuelven los nombres en una sola consulta, y
  // acotada a la organización para no usar esta pantalla como directorio ajeno.
  const idsPedidores = [
    ...new Set(propuestasJarvis.map((p) => p.requestedBy).filter((v) => v && v !== "jarvis")),
  ];
  const nombres = new Map<string, string>();
  if (idsPedidores.length > 0) {
    const personas = await db.user.findMany({
      where: { organizationId, id: { in: idsPedidores } },
      select: { id: true, name: true },
    });
    for (const p of personas) nombres.set(p.id, p.name);
  }

  const deProducto: EntradaHistorial[] = acciones.map((a) => {
    const desenlace =
      a.status === "PROPUESTA" ? "PENDIENTE" : a.status === "RECHAZADA" ? "NEGADA" : "ACEPTADA";

    return {
      id: a.id,
      origen: "PRODUCTO",
      tipo: TIPO_PRODUCTO[a.kind] ?? a.kind,
      detalle: a.detail,
      motivo: a.reason,
      pedidaPor: a.proposedBy.name,
      pedidaEl: a.createdAt.toISOString(),
      desenlace,
      matiz: a.status === "HECHA" ? "ya realizada" : null,
      resueltaPor: a.decidedBy?.name ?? null,
      resueltaEl: a.decidedAt?.toISOString() ?? null,
      nota: a.decisionNote,
      admiteNota: true,
      resolubleAqui: a.status === "PROPUESTA",
      asignadaA: a.assignee?.name ?? null,
      cantidad: a.cantidad,
      creativos: a._count.requirements > 0 ? a._count.requirements : null,
    };
  });

  const deJarvis: EntradaHistorial[] = propuestasJarvis.map((p) => {
    const desenlace =
      p.status === "PENDING" ? "PENDIENTE" : p.status === "REJECTED" ? "NEGADA" : "ACEPTADA";

    // Aprobar y ejecutar son dos pasos: una acción aprobada que todavía no
    // corrió contra Meta o TikTok no es lo mismo que una que ya se aplicó, y
    // una que falló al aplicarse tampoco. El desenlace de dirección es el
    // mismo —la aceptaron— y lo demás se cuenta aparte.
    const matiz =
      p.status === "EXECUTED"
        ? "ya aplicada en la plataforma"
        : p.status === "FAILED"
          ? "falló al aplicarse en la plataforma"
          : p.status === "APPROVED"
            ? "aprobada, todavía sin aplicarse"
            : null;

    return {
      id: p.id,
      origen: "JARVIS",
      tipo: TIPO_JARVIS[p.type] ?? p.type,
      detalle: detalleJarvis(p.type, p.payload, p.campaign.name),
      motivo: p.reason,
      pedidaPor:
        p.requestedBy === "jarvis"
          ? "Jarvis"
          : (nombres.get(p.requestedBy) ?? "Alguien que ya no está en el equipo"),
      pedidaEl: p.createdAt.toISOString(),
      desenlace,
      matiz,
      resueltaPor: p.approvedBy?.name ?? null,
      resueltaEl: p.resolvedAt?.toISOString() ?? null,
      // `PendingAction` no tiene columna para la nota de quien decide. No se
      // rellena con nada: la pantalla dice que este mecanismo no la guarda, en
      // vez de mostrar un vacío que se lee como "no escribió nada".
      nota: null,
      admiteNota: false,
      // Las de Jarvis se aprueban desde su propia pantalla, que además dispara
      // la ejecución contra la plataforma. Resolverlas desde aquí saltearía ese
      // paso y dejaría la campaña sin tocar.
      resolubleAqui: false,
      asignadaA: null,
      cantidad: null,
      creativos: null,
    };
  });

  return [...deProducto, ...deJarvis].sort((a, b) => b.pedidaEl.localeCompare(a.pedidaEl));
}
