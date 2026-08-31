import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import type { Pulse } from "@/lib/pulse";

// El puente entre el diagnóstico y el trabajo.
//
// El panel ya sabe qué producto se está yendo de CPA. Lo que faltaba era el
// paso siguiente: convertir eso en una decisión con nombre y apellido — quién
// la pidió, quién la aprobó, quién la va a hacer y para cuándo. Sin esto el
// equipo lee el número, lo comenta por chat y no queda registro de nada.

export const TIPOS = {
  MAS_CREATIVOS: {
    label: "Pedir creativos nuevos",
    ayuda: "Nace un requerimiento por pieza, asignado al editor que se elija.",
  },
  ESCALAR: {
    label: "Escalar presupuesto",
    ayuda: "Para cuando el CPA está por debajo del objetivo y aguanta más plata.",
  },
  PAUSAR: {
    label: "Pausar la pauta",
    ayuda: "Para cuando el producto gasta y no vende.",
  },
  REVISAR_OFERTA: {
    label: "Revisar precio u oferta",
    ayuda: "Cuando el problema no es el creativo sino el margen.",
  },
} as const;

export type TipoAccion = keyof typeof TIPOS;

export const ES_TIPO = (v: string): v is TipoAccion => v in TIPOS;

/**
 * Qué conviene proponer para un producto, según su pulso.
 *
 * Es una sugerencia, no una orden: la escribe el sistema a partir de números
 * que ya calculó, y una persona decide. Se deja explícito el motivo para que
 * quien aprueba no tenga que ir a buscar el dato a otra pantalla.
 *
 * `verCifras` cambia cómo se redacta ese motivo, no cuál es la sugerencia:
 * quien no ve dinero igual tiene que saber que conviene escalar o renovar
 * creativos, pero el porqué se cuenta con el desvío contra el objetivo en
 * porcentaje en vez de con el monto. El texto viaja al navegador dentro de la
 * propuesta, así que recortarlo en la pantalla no serviría de nada.
 */
export function sugerirAcciones(
  p: Pulse,
  verCifras = true
): { kind: TipoAccion; detail: string; reason: string }[] {
  const plata = (n: number) =>
    n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  if (p.state === "SIN_DATOS") return [];

  if (p.cpa == null) {
    return [
      {
        kind: "PAUSAR",
        detail: "Pausar hasta entender por qué no atribuye compras",
        reason: verCifras
          ? `Gastó ${plata(p.spend)} sin una sola compra atribuida.`
          : "Tuvo pauta en el período y no atribuyó ni una compra.",
      },
      {
        kind: "MAS_CREATIVOS",
        detail: "Probar ángulos nuevos antes de descartarlo",
        reason: verCifras
          ? `Gastó ${plata(p.spend)} sin compras: puede ser el creativo y no el producto.`
          : "Tuvo pauta sin compras: puede ser el creativo y no el producto.",
      },
    ];
  }

  const ratio = p.cpaTarget && p.cpaTarget > 0 ? p.cpa / p.cpaTarget : null;

  if (p.state === "RIESGO") {
    return [
      {
        kind: "MAS_CREATIVOS",
        detail: "Tandas de creativos nuevos para bajar el costo por compra",
        reason: verCifras
          ? ratio != null
            ? `CPA de ${p.cpa.toFixed(2)} contra un objetivo de ${(p.cpaTarget ?? 0).toFixed(2)}: paga ${Math.round((ratio - 1) * 100)}% de más.`
            : `CPA de ${p.cpa.toFixed(2)} y el pulso viene cayendo.`
          : ratio != null
            ? `El costo por compra está ${Math.round((ratio - 1) * 100)}% por encima del objetivo del producto.`
            : "El pulso viene cayendo.",
      },
      {
        kind: "PAUSAR",
        detail: "Pausar mientras se renuevan los creativos",
        reason: verCifras
          ? `Está gastando ${plata(p.spend)} por encima de lo que el producto aguanta.`
          : "Está pagando por compra más de lo que el producto aguanta.",
      },
      {
        kind: "REVISAR_OFERTA",
        detail: "Revisar precio, costo o armado del pack",
        reason: "Si el objetivo no se alcanza con ningún creativo, el problema es el margen.",
      },
    ];
  }

  if (p.state === "SANO") {
    return [
      {
        kind: "ESCALAR",
        detail: "Subir presupuesto mientras el costo por compra aguante",
        reason: verCifras
          ? ratio != null
            ? `CPA de ${p.cpa.toFixed(2)} contra un objetivo de ${(p.cpaTarget ?? 0).toFixed(2)}: sobra margen.`
            : `CPA de ${p.cpa.toFixed(2)}, dentro de lo esperado.`
          : ratio != null
            ? `El costo por compra está ${Math.round((1 - ratio) * 100)}% por debajo del objetivo: sobra margen.`
            : "El costo por compra está dentro de lo esperado.",
      },
      {
        kind: "MAS_CREATIVOS",
        detail: "Creativos nuevos para sostener el escalado",
        reason: "Al subir presupuesto la frecuencia sube y el creativo se gasta antes.",
      },
    ];
  }

  return [
    {
      kind: "MAS_CREATIVOS",
      detail: "Renovar creativos antes de que empeore",
      reason: verCifras
        ? ratio != null
          ? `CPA de ${p.cpa.toFixed(2)} contra un objetivo de ${(p.cpaTarget ?? 0).toFixed(2)}.`
          : "El pulso viene bajando."
        : ratio != null
          ? `El costo por compra está ${Math.round(Math.abs(ratio - 1) * 100)}% ${ratio >= 1 ? "por encima" : "por debajo"} del objetivo del producto.`
          : "El pulso viene bajando.",
    },
  ];
}

/** Quién puede aprobar o rechazar: el dueño y la directora creativa. */
export function puedeDecidir(role: SessionPayload["role"]) {
  return role === "OWNER" || role === "DIRECTOR";
}

/**
 * Aprueba una acción y, si es un pedido de creativos, los crea ya asignados.
 *
 * Los requerimientos nacen aquí y no en otra pantalla a propósito: si aprobar y
 * agendar fueran dos pasos separados, la mitad de las acciones aprobadas se
 * quedarían sin agendar y nadie se enteraría.
 */
export async function aprobarAccion(
  session: SessionPayload,
  accionId: string,
  opciones: { assigneeId?: string | null; dueDate?: string | null; nota?: string | null }
) {
  const accion = await db.productAction.findUnique({
    where: { id: accionId },
    include: { product: { select: { id: true, name: true, code: true } } },
  });
  if (!accion || accion.organizationId !== session.organizationId) {
    return { error: "Esa acción no existe.", status: 404 as const };
  }
  if (accion.status !== "PROPUESTA") {
    return { error: "Esa acción ya fue resuelta.", status: 409 as const };
  }

  // El responsable tiene que ser del equipo. Sin este control se podría
  // asignar trabajo a alguien de otra organización.
  let assigneeId: string | null = null;
  if (opciones.assigneeId) {
    const persona = await db.user.findUnique({
      where: { id: opciones.assigneeId },
      select: { id: true, organizationId: true },
    });
    if (!persona || persona.organizationId !== session.organizationId) {
      return { error: "Esa persona no es del equipo.", status: 400 as const };
    }
    assigneeId = persona.id;
  }

  if (accion.kind === "MAS_CREATIVOS" && !assigneeId) {
    return { error: "Elige a quién le toca hacer los creativos.", status: 400 as const };
  }

  const dueDate = opciones.dueDate ? new Date(opciones.dueDate) : null;
  const fechaValida = dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null;

  const actualizada = await db.productAction.update({
    where: { id: accion.id },
    data: {
      status: "APROBADA",
      decidedById: session.userId,
      decidedAt: new Date(),
      decisionNote: opciones.nota?.trim() || null,
      assigneeId,
      dueDate: fechaValida,
    },
  });

  let creados = 0;
  if (accion.kind === "MAS_CREATIVOS" && assigneeId) {
    const cuantos = Math.min(Math.max(accion.cantidad ?? 1, 1), 20);
    for (let i = 1; i <= cuantos; i++) {
      await db.requirement.create({
        data: {
          organizationId: session.organizationId,
          productId: accion.productId,
          actionId: accion.id,
          adName: `${accion.product.name} · pieza ${i} de ${cuantos}`,
          // Los campos de clasificación quedan en blanco a propósito: los
          // completa quien lo produce. Poner valores por defecto haría que
          // la mitad del catálogo quedara clasificado como "ORIGINAL / F1"
          // sin que nadie lo haya decidido.
          adType: "",
          phase: "",
          visualFormat: "",
          angle: "",
          awarenessLevel: "",
          marketOrigin: "",
          ownerId: assigneeId,
          status: "PENDIENTE",
          dueDate: fechaValida,
          notes: `${accion.detail}\n\nPor qué: ${accion.reason}`,
        },
      });
      creados += 1;
    }
  }

  // Aviso a quien le tocó. Sin esto la asignación existe pero nadie se entera.
  if (assigneeId && assigneeId !== session.userId) {
    await db.notification.create({
      data: {
        userId: assigneeId,
        type: "asignacion",
        message:
          accion.kind === "MAS_CREATIVOS"
            ? `Te asignaron ${creados} ${creados === 1 ? "creativo" : "creativos"} de ${accion.product.name}${
                fechaValida ? ` para el ${fechaValida.toLocaleDateString("es-EC", { timeZone: "UTC" })}` : ""
              }.`
            : `Te asignaron una acción de ${accion.product.name}: ${accion.detail}.`,
        link: "/dashboard/pipeline",
      },
    });
  }

  return { ok: true as const, accion: actualizada, creados };
}

export async function rechazarAccion(
  session: SessionPayload,
  accionId: string,
  nota?: string | null
) {
  const accion = await db.productAction.findUnique({
    where: { id: accionId },
    select: { id: true, organizationId: true, status: true, proposedById: true, product: { select: { name: true } } },
  });
  if (!accion || accion.organizationId !== session.organizationId) {
    return { error: "Esa acción no existe.", status: 404 as const };
  }
  if (accion.status !== "PROPUESTA") {
    return { error: "Esa acción ya fue resuelta.", status: 409 as const };
  }

  await db.productAction.update({
    where: { id: accion.id },
    data: {
      status: "RECHAZADA",
      decidedById: session.userId,
      decidedAt: new Date(),
      decisionNote: nota?.trim() || null,
    },
  });

  // Se le avisa a quien la propuso: proponer algo y que desaparezca sin
  // respuesta es la forma más rápida de que nadie proponga nunca más.
  if (accion.proposedById !== session.userId) {
    await db.notification.create({
      data: {
        userId: accion.proposedById,
        type: "asignacion",
        message: `Se rechazó tu propuesta para ${accion.product.name}${nota?.trim() ? `: ${nota.trim()}` : "."}`,
        link: "/dashboard/productos",
      },
    });
  }

  return { ok: true as const };
}
