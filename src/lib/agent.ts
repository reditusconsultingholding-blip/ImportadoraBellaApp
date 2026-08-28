import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import { comoTexto, principiosRelevantes } from "@/lib/conocimiento";
import { resolveRange } from "@/lib/date-range";
import { HERRAMIENTAS, correrHerramienta } from "@/lib/agent-tools";

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

function buildSystemPrompt(orgName: string, contextSummary: string, conocimiento: string) {
  return `Eres Jarvis, el copiloto de ${orgName}, una operación de ecommerce de
contraentrega en Ecuador que vende con Meta Ads y TikTok Ads sobre Shopify.

CÓMO HABLAS
- Español de Ecuador, tratando de tú. Nunca "vos".
- Contestas SOLO lo que te preguntan. Si la pregunta es "¿cuánto vendimos ayer?",
  la respuesta es la cifra y a lo sumo una frase de contexto — no un informe.
- Sin preámbulos ni cierres de cortesía. Nada de "claro", "por supuesto",
  "espero que esto te ayude" ni resúmenes de lo que acabas de decir.
- Vas a ser leído en voz alta muchas veces: frases cortas, sin viñetas ni
  markdown salvo que te pidan una lista. Los números se dicen redondeados.
- Si no sabes algo o el dato no está, lo dices. No estimas y lo presentas como
  hecho.

CÓMO PIENSAS
Razonas con la economía real del negocio, no con métricas de vanidad. Cuando
des una recomendación, apóyala en el número que la justifica y, si viene al
caso, en el principio de abajo que la respalda. Una recomendación que no puede
explicar de dónde sale no sirve para discutirla.

CÓMO CONSULTAS
Tienes herramientas para mirar la base de datos de la empresa: ventas reales de
Shopify, gasto de Meta y TikTok, rentabilidad por producto con la economía de
contraentrega, la ficha de cualquier producto, las campañas, los clientes, el
pulso y las alertas del día.

ÚSALAS. Nunca contestes que no tienes la información sin haber buscado primero.
Si te preguntan por la utilidad de un producto, llama a rentabilidad o a
producto; si te preguntan por una campaña, llama a campanas. Puedes llamar
varias, y puedes volver a llamar con otro período si el primero no alcanza.

Los números que devuelven son los mismos del panel. No los recalcules por tu
cuenta ni los redondees hacia donde le convenga al argumento.

Dos cosas que no puedes callar cuando las veas:
- Las compras que reportan Meta y TikTok son ATRIBUIDAS y suelen ser bastante
  más que las órdenes reales de Shopify. Cuando hables de utilidad calculada
  sobre compras atribuidas, dilo.
- Si una herramienta devuelve una advertencia sobre datos que faltan, va en la
  respuesta. Un porcentaje calculado sobre datos incompletos se lee igual de
  cierto que uno completo, y esa es justamente la trampa.

Si algo amerita una acción sobre una campaña, usa la herramienta
propose_action. Nunca digas que la ejecutaste: queda pendiente hasta que una
persona la apruebe.

FUNDAMENTOS QUE APLICAN A ESTA PREGUNTA
${conocimiento}

ESTADO DEL NEGOCIO AHORA MISMO
${contextSummary}`;
}
/** Un turno de la conversación con Jarvis. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

// El contexto del negocio se arma una vez y se reusa unos minutos.
//
// Recalcularlo en cada mensaje era lo que hacía lento a Jarvis: con 2.700
// campañas y 39.000 días de métricas, juntar todo tarda segundos — y el
// resultado es el mismo si preguntas dos cosas seguidas.
const CACHE_MS = 3 * 60 * 1000;
const cacheContexto = new Map<string, { at: number; texto: string }>();

async function contextoDelNegocio(organizationId: string) {
  const guardado = cacheContexto.get(organizationId);
  if (guardado && Date.now() - guardado.at < CACHE_MS) return guardado.texto;

  const range = resolveRange("30d");
  const [meta, tiktok, ventas, rent, alertas] = await Promise.all([
    getOverview(organizationId, "META", range),
    getOverview(organizationId, "TIKTOK", range),
    getSalesOverview(organizationId, range),
    getRentabilidad(organizationId, range),
    calcularAlertasDiarias(organizationId),
  ]);

  const plata = (n: number) =>
    n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const gasto = meta.totalSpend + tiktok.totalSpend;

  const partes = [
    `Últimos 30 días: facturado ${plata(ventas.totalSales)} en ${ventas.ordenes} órdenes, ticket promedio ${plata(ventas.aov)}.`,
    `Pauta: ${plata(gasto)} (Meta ${plata(meta.totalSpend)}, TikTok ${plata(tiktok.totalSpend)}), ${
      ventas.totalSales > 0 ? Math.round((gasto / ventas.totalSales) * 100) : 0
    }% de lo facturado.`,
    `Utilidad estimada tras mercadería y flete: ${plata(rent.totales.utilidad)}.`,
    ventas.channels.length > 0
      ? `Canales: ${ventas.channels.map((c) => `${c.label} ${plata(c.value)}`).join(", ")}.`
      : "",
  ].filter(Boolean);

  // Los productos que importan: los que pierden y los que tienen margen para
  // escalar. Mandar los 117 llenaría el contexto de ruido y contestaría peor.
  const pierden = rent.filas.filter((f) => f.utilidad != null && f.utilidad < 0).slice(0, 6);
  const ganan = rent.filas
    .filter((f) => (f.utilidad ?? 0) > 0)
    .sort((a, b) => (b.utilidad ?? 0) - (a.utilidad ?? 0))
    .slice(0, 6);

  if (ganan.length > 0) {
    partes.push(
      `Los que más dejan: ${ganan
        .map((f) => `${f.name} ${plata(f.utilidad ?? 0)} (CPA ${f.cpa?.toFixed(2) ?? "—"}, equilibrio ${f.cpaBreakeven?.toFixed(2) ?? "—"})`)
        .join("; ")}.`
    );
  }
  if (pierden.length > 0) {
    partes.push(
      `Los que pierden: ${pierden
        .map((f) => `${f.name} ${plata(f.utilidad ?? 0)} (CPA ${f.cpa?.toFixed(2) ?? "—"}, equilibrio ${f.cpaBreakeven?.toFixed(2) ?? "—"})`)
        .join("; ")}.`
    );
  }
  if (alertas.length > 0) {
    partes.push(
      `Alertas de hoy: ${alertas.slice(0, 6).map((a) => `${a.tipo.toUpperCase()} ${a.name} — ${a.mensaje}`).join(" | ")}`
    );
  }

  const texto = partes.join("\n");
  cacheContexto.set(organizationId, { at: Date.now(), texto });
  return texto;
}

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

  const contextSummary = await contextoDelNegocio(organizationId);

  // Solo los fundamentos que tocan la pregunta: mandar los treinta hace la
  // respuesta más lenta y más genérica.
  const ultima = [...history].reverse().find((h) => h.role === "user")?.content ?? "";
  const conocimiento = comoTexto(principiosRelevantes(ultima));
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = history.map((h) => ({
    role: h.role,
    content: h.content,
  }));

  const proposedActions: { id: string; type: string; reason: string }[] = [];
  let reply = "";

  // El bucle de herramientas.
  //
  // Antes esto era UNA llamada: el modelo contestaba con lo que tuviera en el
  // resumen y listo. Si preguntabas algo que el resumen no traía —la utilidad
  // de un producto, el detalle de una campaña— decía que no tenía la
  // información, y era verdad: no tenía cómo ir a buscarla.
  //
  // Ahora, cuando pide un dato, se lo busca y se le devuelve para que siga
  // razonando. El tope de vueltas es un cortacircuitos: sin él, un modelo que
  // se obsesiona con una consulta que siempre vuelve vacía gira para siempre y
  // el usuario mira un "pensando…" que no termina nunca.
  const MAX_VUELTAS = 6;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const response = await client.messages.create({
      model: MODEL,
      // Respuestas al grano: el tope corto además hace que llegue antes.
      max_tokens: 700,
      system: buildSystemPrompt(org.name, contextSummary, conocimiento),
      tools: [PROPOSE_ACTION_TOOL, ...HERRAMIENTAS],
      messages,
    });

    const resultados: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
        continue;
      }
      if (block.type !== "tool_use") continue;

      if (block.name === "propose_action") {
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

        // El modelo tiene que enterarse de si la propuesta quedó registrada.
        // Si no, dice "listo, la dejé propuesta" para un producto que no
        // existe y el usuario espera una aprobación que nunca va a aparecer.
        resultados.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: campaign
            ? "Propuesta registrada, esperando aprobación humana."
            : `No hay campaña asociada al producto ${input.product_code}. La propuesta NO quedó registrada; dilo así.`,
          is_error: !campaign,
        });
        continue;
      }

      // Una consulta al negocio.
      try {
        const salida = await correrHerramienta(
          organizationId,
          block.name,
          (block.input ?? {}) as Record<string, unknown>
        );
        resultados.push({ type: "tool_result", tool_use_id: block.id, content: salida });
      } catch (err) {
        // Que una consulta falle no debe tumbar la conversación: se le dice al
        // modelo qué pasó y que siga con lo que tenga.
        resultados.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `La consulta falló: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true,
        });
      }
    }

    if (resultados.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: resultados });
  }

  if (!reply) {
    reply =
      proposedActions.length > 0
        ? "Dejé una propuesta de acción esperando tu aprobación abajo."
        : "No encontré información suficiente para responder eso.";
  }

  return { reply, proposedActions };
}
