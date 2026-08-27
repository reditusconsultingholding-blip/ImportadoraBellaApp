import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { resolveRange } from "@/lib/date-range";

const MODEL = "claude-sonnet-5";

const PROPOSE_ACTION_TOOL: Anthropic.Tool = {
  name: "propose_action",
  description:
    "Propone pausar, reanudar o escalar presupuesto de una campaña. Nunca se ejecuta sola: queda pendiente de aprobación humana en el panel.",
  input_schema: {
    type: "object",
    properties: {
      product_code: { type: "string", description: "Código del producto, ej. BAT-001" },
      type: {
        type: "string",
        enum: ["PAUSE_CAMPAIGN", "RESUME_CAMPAIGN", "SCALE_BUDGET"],
      },
      daily_budget: {
        type: "number",
        description: "Nuevo presupuesto diario en USD, solo si type=SCALE_BUDGET",
      },
      reason: { type: "string", description: "Por qué se sugiere esta acción" },
    },
    required: ["product_code", "type", "reason"],
  },
};

function buildSystemPrompt(orgName: string, contextSummary: string) {
  return `Sos Jarvis, el asistente de campañas publicitarias de ${orgName}.

Tenés acceso de solo lectura a las métricas de Meta (Facebook + Instagram) y TikTok.
Respondé en español, directo, con números concretos — no generalidades.

Cuando algo amerite una acción (pausar una campaña que está sangrando presupuesto,
escalar una que rinde bien), usá la herramienta propose_action. Nunca digas que ya
la ejecutaste: la acción queda pendiente hasta que la persona la apruebe desde el panel.

Estado actual de las cuentas:
${contextSummary}`;
}

function summarize(overview: Awaited<ReturnType<typeof getOverview>>, platformLabel: string) {
  if (overview.rows.length === 0) return `${platformLabel}: sin campañas con datos en el período.`;
  // Solo las 20 que más gastan: con 700 campañas, mandarlas todas llenaría el
  // contexto de ruido y Jarvis contestaría peor, no mejor.
  const lines = overview.rows.slice(0, 20).map(
    (p) =>
      `- ${p.name}${p.code ? ` (${p.code})` : " (sin producto asociado)"}: gasto US${p.spend.toFixed(0)}, ${p.purchases} compras, CPA US${
        p.cpa?.toFixed(1) ?? "—"
      }${p.cpaTarget !== null ? ` (objetivo US${p.cpaTarget})` : ""} — ${p.status === "urgent" ? "URGENTE" : p.status === "ok" ? "bien" : "sin objetivo"}`
  );
  return `${platformLabel} — gasto total US$${overview.totalSpend.toFixed(0)}, CTR ${overview.ctr.toFixed(
    2
  )}%:\n${lines.join("\n")}`;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function chatWithJarvis(organizationId: string, history: ChatTurn[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      reply:
        "Todavía no tengo configurada la API de Claude (falta ANTHROPIC_API_KEY). Una vez que la agreguemos ya puedo responder preguntas sobre tus campañas.",
      proposedActions: [] as { id: string; type: string; reason: string }[],
    };
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  // Jarvis mira los últimos 30 días: es el período que da contexto sin que un
  // mal día puntual parezca una tendencia.
  const range = resolveRange("30d");
  const [metaOverview, tiktokOverview] = await Promise.all([
    getOverview(organizationId, "META", range),
    getOverview(organizationId, "TIKTOK", range),
  ]);

  const contextSummary = [
    summarize(metaOverview, "Meta"),
    summarize(tiktokOverview, "TikTok"),
  ].join("\n\n");

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = history.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: buildSystemPrompt(org.name, contextSummary),
    tools: [PROPOSE_ACTION_TOOL],
    messages,
  });

  const proposedActions: { id: string; type: string; reason: string }[] = [];
  let reply = "";

  for (const block of response.content) {
    if (block.type === "text") {
      reply += block.text;
    } else if (block.type === "tool_use" && block.name === "propose_action") {
      const input = block.input as {
        product_code: string;
        type: "PAUSE_CAMPAIGN" | "RESUME_CAMPAIGN" | "SCALE_BUDGET";
        daily_budget?: number;
        reason: string;
      };

      const product = await db.product.findFirst({
        where: { organizationId, code: input.product_code },
      });
      const campaign = product
        ? await db.campaign.findFirst({ where: { productId: product.id } })
        : null;

      if (campaign) {
        const action = await db.pendingAction.create({
          data: {
            campaignId: campaign.id,
            requestedBy: "jarvis",
            type: input.type,
            payload: JSON.stringify({ dailyBudget: input.daily_budget }),
            reason: input.reason,
          },
        });
        proposedActions.push({ id: action.id, type: action.type, reason: action.reason });
      }
    }
  }

  if (!reply) {
    reply =
      proposedActions.length > 0
        ? "Dejé una propuesta de acción esperando tu aprobación abajo."
        : "No encontré información suficiente para responder eso.";
  }

  return { reply, proposedActions };
}
