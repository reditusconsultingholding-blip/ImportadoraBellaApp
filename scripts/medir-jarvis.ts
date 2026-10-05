/**
 * ¿Por qué Jarvis tarda tanto?
 *
 * Fabricio escribió "demora demasiado en responder". Antes de cambiarle el
 * modelo por corazonada, se mide: se corre el MISMO bucle de herramientas que
 * usa la app —mismo prompt, mismas herramientas, misma pregunta— contra varias
 * configuraciones, y se cronometra cada vuelta.
 *
 * Las herramientas no tocan la base: devuelven JSON de mentira. Lo que se está
 * midiendo es el modelo, no Postgres, y así el número no cambia según cómo
 * ande la red hasta Supabase.
 *
 *   npx tsx scripts/medir-jarvis.ts
 *
 * OJO: necesita una clave asignada a un workspace. La que hay en el .env local
 * es de organización y la API la rechaza con un 400 pidiendo la cabecera
 * anthropic-workspace-id; la que corre en Railway sí sirve. Si todas las
 * configuraciones salen "FALLÓ" con ese mensaje, es eso y no el script.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { HERRAMIENTAS } from "../src/lib/agent-tools";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("falta ANTHROPIC_API_KEY");
const client = new Anthropic({ apiKey });

/* Un prompt del tamaño real: el de la app ronda las 1.400 palabras entre la
   personalidad, las reglas, los fundamentos y el estado del negocio. Uno de
   juguete mediría otra cosa. */
const SISTEMA = `Eres Jarvis, el copiloto de Importadora Bella, una operación de
ecommerce de contraentrega en Ecuador que vende con Meta Ads y TikTok Ads sobre
Shopify.

QUIÉN ERES
Un consultor de ecommerce con años de operación encima, sentado del lado de
ellos. No un buscador de datos: alguien que mira los números, entiende qué está
pasando y dice qué haría. Cercano y directo, sin ser blando.

CÓMO HABLAS
- Español de Ecuador, tratando de tú. Nunca "vos".
- Contestas SOLO lo que te preguntan. Sin preámbulos ni cierres de cortesía.
- Vas a ser leído en voz alta: frases cortas, sin viñetas ni markdown.

CÓMO CONSULTAS
Tienes herramientas para mirar la base de datos de la empresa: ventas reales de
Shopify, gasto de Meta y TikTok, rentabilidad por producto con la economía de
contraentrega, la ficha de cualquier producto, las campañas, los clientes, el
pulso y las alertas del día. ÚSALAS. Nunca contestes que no tienes la
información sin haber buscado primero.

Las compras que reportan Meta y TikTok son ATRIBUIDAS y suelen ser bastante más
que las órdenes reales de Shopify. Cuando hables de utilidad calculada sobre
compras atribuidas, dilo.

CUANDO TE PIDAN LLEGAR A UNA META
Se contesta con la cuenta hacia atrás, no con consejos generales: dónde están
hoy, qué productos ya ganan y cuánto margen de CPA les sobra antes de tocar su
punto de equilibrio, cuánta pauta más haría falta a los CPA actuales, y qué hay
que arreglar primero. Productos por nombre y números, no "optimiza tus
campañas".

FUNDAMENTOS QUE APLICAN A ESTA PREGUNTA
El CPA de equilibrio es el techo de lo que se puede pagar por una venta sin
perder plata, y sale del margen de contribución por unidad entregada, no del
precio. En contraentrega la tasa de entrega manda: un producto con 70% de
entrega necesita vender 1,43 para cobrar una. Escalar un producto que pierde
multiplica la pérdida; escalar uno con margen de CPA sobrante es lo único que
crece sin costar plata. Un creativo se cansa cuando su frecuencia sube y el CTR
baja: no se arregla subiendo presupuesto.

ESTADO DEL NEGOCIO AHORA MISMO
Últimos 30 días: facturado $48.300 en 1.247 órdenes, ticket promedio $39.
Pauta: $14.800 (Meta $14.800, TikTok $0), 31% de lo facturado.
Utilidad estimada tras mercadería y flete: $9.100.
Los que más dejan: NIDA $2.980 (CPA 7,40, equilibrio 11,20); BATANA $1.760
(CPA 6,10, equilibrio 9,80); CYPERUS $1.240 (CPA 8,90, equilibrio 12,10).
Los que pierden: CIARA -$640 (CPA 15,30, equilibrio 10,40); GINSENG -$210
(CPA 13,80, equilibrio 11,90).
Alertas de hoy: RIESGO CIARA — CPA 47% sobre el equilibrio tres días seguidos.`;

/* Respuestas de mentira, con la forma de las de verdad. */
function herramientaFalsa(nombre: string): string {
  if (nombre === "rentabilidad") {
    return JSON.stringify({
      totales: { facturado: 48300, gasto: 14800, utilidad: 9100 },
      filas: [
        { name: "NIDA", utilidad: 2980, cpa: 7.4, cpaBreakeven: 11.2, ordenes: 402 },
        { name: "BATANA", utilidad: 1760, cpa: 6.1, cpaBreakeven: 9.8, ordenes: 288 },
        { name: "CYPERUS", utilidad: 1240, cpa: 8.9, cpaBreakeven: 12.1, ordenes: 139 },
        { name: "CIARA", utilidad: -640, cpa: 15.3, cpaBreakeven: 10.4, ordenes: 71 },
      ],
    });
  }
  if (nombre === "ventas") {
    return JSON.stringify({ totalSales: 48300, ordenes: 1247, aov: 38.7 });
  }
  return JSON.stringify({ ok: true, nota: "sin datos nuevos en el período" });
}

type Config = {
  etiqueta: string;
  model: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  cache?: boolean;
};

async function correr(cfg: Config, pregunta: string) {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: pregunta }];
  const t0 = Date.now();
  let primerTexto: number | null = null;
  let vueltas = 0;
  let salida = 0;
  let cacheLeido = 0;
  let texto = "";

  for (let v = 0; v < 6; v++) {
    vueltas++;

    /* El prompt se parte en dos para poder cachear la parte que no cambia. En
       la app, la persona y las reglas son iguales siempre; el estado del
       negocio cambia cada tres minutos. */
    const system: Anthropic.TextBlockParam[] = cfg.cache
      ? [
          {
            type: "text",
            text: SISTEMA.slice(0, SISTEMA.indexOf("ESTADO DEL NEGOCIO")),
            cache_control: { type: "ephemeral" },
          },
          { type: "text", text: SISTEMA.slice(SISTEMA.indexOf("ESTADO DEL NEGOCIO")) },
        ]
      : [{ type: "text", text: SISTEMA }];

    const stream = client.messages.stream({
      model: cfg.model,
      max_tokens: 20_000,
      system,
      tools: HERRAMIENTAS,
      messages,
      ...(cfg.effort ? { output_config: { effort: cfg.effort } } : {}),
    });

    stream.on("text", () => {
      if (primerTexto === null) primerTexto = Date.now() - t0;
    });

    const res = await stream.finalMessage();
    salida += res.usage.output_tokens;
    cacheLeido += res.usage.cache_read_input_tokens ?? 0;

    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const b of res.content) {
      if (b.type === "text") texto += b.text;
      if (b.type === "tool_use") {
        resultados.push({
          type: "tool_result",
          tool_use_id: b.id,
          content: herramientaFalsa(b.name),
        });
      }
    }

    if (resultados.length === 0) break;
    messages.push({ role: "assistant", content: res.content });
    messages.push({ role: "user", content: resultados });
  }

  return {
    etiqueta: cfg.etiqueta,
    total: Date.now() - t0,
    primerTexto,
    vueltas,
    salida,
    cacheLeido,
    palabras: texto.trim().split(/\s+/).length,
  };
}

const PREGUNTAS = [
  ["corta", "¿cuánto vendimos en los últimos 30 días?"],
  ["difícil", "¿qué hago para escalar a 50 mil al mes?"],
] as const;

const CONFIGS: Config[] = [
  { etiqueta: "opus-5 (lo que corre hoy)", model: "claude-opus-5" },
  { etiqueta: "sonnet-5-5 effort low", model: "claude-sonnet-5-5", effort: "low" },
  { etiqueta: "sonnet-5-5 low + caché", model: "claude-sonnet-5-5", effort: "low", cache: true },
  { etiqueta: "haiku-4-5", model: "claude-haiku-4-5" },
];

async function main() {
  for (const [tipo, pregunta] of PREGUNTAS) {
    console.log(`\n=== pregunta ${tipo}: "${pregunta}"`);
    for (const cfg of CONFIGS) {
      try {
        const r = await correr(cfg, pregunta);
        console.log(
          `  ${r.etiqueta.padEnd(26)} total ${String(r.total).padStart(6)}ms  ` +
            `1er texto ${String(r.primerTexto ?? -1).padStart(6)}ms  ` +
            `vueltas ${r.vueltas}  tokens ${String(r.salida).padStart(5)}  ` +
            `caché ${String(r.cacheLeido).padStart(5)}  palabras ${r.palabras}`
        );
      } catch (e) {
        console.log(`  ${cfg.etiqueta.padEnd(26)} FALLÓ: ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

main();
