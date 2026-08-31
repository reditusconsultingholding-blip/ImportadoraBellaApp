import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import { comoTexto, principiosRelevantes } from "@/lib/conocimiento";
import { resolveRange } from "@/lib/date-range";
import { HERRAMIENTAS, correrHerramienta } from "@/lib/agent-tools";

const MODEL = "claude-opus-5";

/**
 * Búsqueda en internet, resuelta por Anthropic en su servidor.
 *
 * La app no sale a internet por su cuenta: se declara la herramienta y el
 * modelo busca, lee y cita solo. Por eso no hace falta otra clave ni montar
 * un buscador propio.
 *
 * Está para lo que la base NO puede contestar: qué recomiendan los autores
 * conocidos de ecommerce, cómo cambió una política de Meta, qué se está
 * haciendo en el mercado. Para números del negocio están las otras
 * herramientas, y el prompt le dice que esas van primero — un dato de la
 * operación buscado en Google sería inventado.
 */
const BUSQUEDA_WEB: Anthropic.Tool = {
  type: "web_search_20260209",
  name: "web_search",
  // Tope de búsquedas por respuesta: cada una cuesta y alarga la espera.
  max_uses: 4,
} as unknown as Anthropic.Tool;

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

QUIÉN ERES
Un consultor de ecommerce con años de operación encima, sentado del lado de
ellos. No un buscador de datos: alguien que mira los números, entiende qué está
pasando y dice qué haría. Cercano y directo, sin ser blando: si algo está mal,
lo dices.

CÓMO HABLAS
- Español de Ecuador, tratando de tú. Nunca "vos".
- Contestas SOLO lo que te preguntan. Si la pregunta es "¿cuánto vendimos ayer?",
  la respuesta es la cifra y a lo sumo una frase de contexto — no un informe.
  Pero si la pregunta es de estrategia ("¿cómo llego a 50 mil?"), la respuesta
  es un plan con números, no una cifra suelta.
- Sin preámbulos ni cierres de cortesía. Nada de "claro", "por supuesto",
  "espero que esto te ayude" ni resúmenes de lo que acabas de decir.
- Vas a ser leído en voz alta muchas veces: frases cortas, sin viñetas ni
  markdown salvo que te pidan una lista. Los números se dicen redondeados.
- Si no sabes algo o el dato no está, lo dices. No estimas y lo presentas como
  hecho.

SIEMPRE CONTESTAS
Ninguna pregunta sobre este negocio se queda sin respuesta. No existe "no
tengo esa información": tienes la base de la empresa y tienes internet.

- ¿Es un dato de la operación? Búscalo con las herramientas.
- ¿Es una pregunta de estrategia o de criterio —cómo escalar, qué creativo
  probar, cómo bajar devoluciones—? Contéstala con los números de la empresa
  Y con lo que se sabe del oficio. Si te sirve traer lo que dicen los autores
  y operadores reconocidos del rubro, búscalo en internet y cítalo.
- ¿Te preguntan algo que de verdad no se puede saber con lo que hay? Dices qué
  falta y qué harías para averiguarlo. Eso también es una respuesta.

Lo único que no haces nunca es inventar un número de la operación. Los datos
del negocio salen de las herramientas, jamás de internet ni de tu memoria.

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

BUSCAR EN INTERNET
Tienes búsqueda web. Es para el oficio, no para el negocio: qué recomiendan los
autores y operadores reconocidos de ecommerce, cómo cambió una política de Meta
o TikTok, qué se está probando en el mercado. Cuando la uses, di de dónde sacas
lo que dices.

Nunca busques en internet un dato de esta empresa. Sus ventas, su gasto y su
rentabilidad viven en las herramientas; cualquier cifra de la operación que
venga de internet es inventada.

CUANDO TE PIDAN LLEGAR A UNA META
Preguntas como "¿qué hago para escalar a 50 mil?" se contestan con la cuenta
hacia atrás, no con consejos generales:
1. Mira dónde están hoy (ventas del período) y cuánto falta.
2. Mira qué productos ya ganan y cuánto margen de CPA les sobra antes de tocar
   su punto de equilibrio: ahí está el crecimiento que no cuesta plata.
3. Di cuánta pauta más haría falta a los CPA actuales, y qué pasa si el CPA
   sube al escalar.
4. Di qué hay que arreglar primero — un producto que pierde y se lleva
   presupuesto, una confirmación baja que se come el margen.
Sé concreto: productos por nombre y números, no "optimiza tus campañas".

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
    // Se pide en streaming aunque la respuesta se devuelva entera.
    //
    // No es para mostrarla letra por letra: es que con un tope alto y sin
    // streaming la conexión se cae por tiempo antes de que el modelo termine.
    // Pidiéndola así, la respuesta llega completa igual y no hay reloj
    // corriendo en contra.
    const response = await client.messages
      .stream({
        model: MODEL,
        // El tope estaba en 700 y ESE era el motivo de que Jarvis se quedara
        // mudo con las preguntas difíciles.
        //
        // El modelo razona antes de contestar, y ese razonamiento se descuenta
        // del MISMO tope. Con 700, una pregunta como "¿qué hago para escalar a
        // 50 mil?" se consumía el presupuesto pensando y no quedaba nada para
        // la respuesta: llegaba un mensaje sin texto, y la pantalla mostraba
        // "no encontré información suficiente" — falso, y encima el peor
        // mensaje posible, porque suena a que no hay datos.
        //
        // 20.000 es un TECHO, no un gasto: se paga lo que de verdad se
        // genera. Las respuestas se mantienen cortas por el prompt, no por
        // asfixia, así que subirlo no encarece nada — solo deja de cortar las
        // preguntas difíciles.
        max_tokens: 20_000,
        system: buildSystemPrompt(org.name, contextSummary, conocimiento),
        tools: [PROPOSE_ACTION_TOOL, BUSQUEDA_WEB, ...HERRAMIENTAS],
        messages,
      })
      .finalMessage();

    const resultados: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        reply += block.text;
        continue;
      }
      // Los bloques de la búsqueda web los resuelve Anthropic en su servidor:
      // llegan ya respondidos y no hay que devolver nada por ellos.
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

    // "pause_turn" es el modelo pidiendo seguir: pasa con la búsqueda web,
    // que corre del lado de Anthropic y a veces devuelve el turno a mitad de
    // camino. Si se cortara acá, una respuesta que estaba buscando fuentes
    // llegaría por la mitad y parecería que se colgó.
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (resultados.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: resultados });
  }

  // Quedarse sin texto es un fallo del asistente, no una falta de datos.
  //
  // El mensaje que había —"no encontré información suficiente"— era la peor
  // salida posible: le echaba la culpa a los datos cuando lo que pasaba era
  // que la respuesta no cabía en el tope de tokens. Quien lo leía concluía
  // que la app no tenía la información, y dejaba de preguntar.
  if (!reply.trim()) {
    reply =
      proposedActions.length > 0
        ? "Dejé una propuesta de acción esperando tu aprobación abajo."
        : "Me quedé sin terminar la respuesta. Vuelve a preguntarme, y si se repite, parte la pregunta en dos.";
  }

  return { reply, proposedActions };
}
