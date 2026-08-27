import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import type { Range } from "@/lib/date-range";

// Lectura en lenguaje natural de lo que está pasando, con recomendaciones
// puntuales. Va debajo de las ventas en el Panel.
//
// La idea es que nadie tenga que cruzar cuatro tablas para darse cuenta de que
// una campaña se está comiendo el presupuesto sin vender. Los números se
// calculan acá con SQL — el modelo solo los interpreta y prioriza. Nunca se le
// pide que calcule: un modelo sumando plata es una mala idea.

const MODEL = "claude-sonnet-5";

// El análisis se guarda un rato: la misma pregunta con los mismos números da
// la misma respuesta, y cada carga del panel no tiene por qué costar una
// llamada al modelo.
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; value: Insights }>();

export type Insights = {
  headline: string;
  findings: { kind: "bueno" | "alerta" | "dato"; text: string }[];
  actions: string[];
  generatedAt: string;
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export async function buildInsights(
  organizationId: string,
  range: Range,
  orgName: string
): Promise<Insights | null> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return null;

  const key = `${organizationId}|${range.id}|${range.from.toISOString()}|${range.to.toISOString()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const [meta, tiktok, ventas, porCanal, porProducto] = await Promise.all([
    getOverview(organizationId, "META", range),
    getOverview(organizationId, "TIKTOK", range),
    db.shopifyOrder.aggregate({
      where: { store: { organizationId }, occurredAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { netSales: true, discounts: true },
    }),
    db.shopifyOrder.groupBy({
      by: ["channel"],
      where: { store: { organizationId }, occurredAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
      _sum: { netSales: true },
    }),
    db.shopifyOrderLineItem.groupBy({
      by: ["productName"],
      where: {
        order: { store: { organizationId }, occurredAt: { gte: range.from, lte: range.to } },
      },
      _sum: { amount: true, quantity: true },
      orderBy: { _sum: { amount: "desc" } },
      take: 8,
    }),
  ]);

  const gasto = meta.totalSpend + tiktok.totalSpend;
  const ordenes = ventas._count._all;
  const facturado = ventas._sum.netSales ?? 0;

  // Sin datos no se le pregunta nada al modelo: contestaría algo genérico y
  // sonaría a relleno.
  if (gasto === 0 && ordenes === 0) return null;

  const topCampanas = [...meta.rows, ...tiktok.rows]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 12)
    .map(
      (r) =>
        `- ${r.name}: gasto ${money(r.spend)}, ${r.purchases} compras${
          r.cpa ? `, CPA ${money(r.cpa)}` : ", sin compras"
        }`
    )
    .join("\n");

  const sinVentas = [...meta.rows, ...tiktok.rows]
    .filter((r) => r.purchases === 0 && r.spend > 20)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 8);

  const contexto = `Período analizado: ${range.label} (${range.from.toISOString().slice(0, 10)} a ${range.to.toISOString().slice(0, 10)}).

VENTAS (Shopify)
- Órdenes: ${ordenes}
- Facturado: ${money(facturado)}
- Ticket promedio: ${ordenes > 0 ? money(facturado / ordenes) : "sin datos"}
- Descuentos otorgados: ${money(ventas._sum.discounts ?? 0)}
- Por canal: ${porCanal.map((c) => `${c.channel} ${c._count._all} órdenes / ${money(c._sum.netSales ?? 0)}`).join(" · ") || "sin datos"}
- Productos más vendidos: ${porProducto.map((p) => `${p.productName} (${p._sum.quantity} u, ${money(p._sum.amount ?? 0)})`).join(" · ") || "sin datos"}

PAUTA
- Meta: gasto ${money(meta.totalSpend)}, ${meta.totalPurchases} compras atribuidas, CTR ${meta.ctr.toFixed(2)}%
- TikTok: gasto ${money(tiktok.totalSpend)}, ${tiktok.totalPurchases} compras atribuidas, CTR ${tiktok.ctr.toFixed(2)}%
- Gasto total en pauta: ${money(gasto)}
- Relación facturado / gasto en pauta: ${gasto > 0 ? (facturado / gasto).toFixed(2) : "sin gasto"}

CAMPAÑAS QUE MÁS GASTAN
${topCampanas || "sin campañas con datos"}

CAMPAÑAS QUE GASTARON SIN VENDER NADA
${sinVentas.map((r) => `- ${r.name}: ${money(r.spend)} sin una sola compra`).join("\n") || "ninguna"}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: `Sos el analista de ${orgName}, una importadora que vende por Meta Ads y TikTok Ads con tienda Shopify en Ecuador.

Te paso los números ya calculados. Tu trabajo es LEERLOS y decir qué está pasando, no recalcular nada.

Reglas:
- Escribí en español rioplatense, directo, sin adornos. Nada de "es importante destacar" ni "en resumen".
- Cada hallazgo tiene que citar un número concreto del contexto. Si no tenés el dato, no lo inventes.
- Las recomendaciones son accionables hoy: qué pausar, qué escalar, qué revisar. Nada de "optimizar la estrategia".
- Si algo se ve raro pero puede tener una explicación inocente, decilo con esa duda en vez de afirmarlo.
- Si la atribución de la pauta no cuadra con las ventas de Shopify, señalalo: suele ser lo más valioso.

Devolvé SOLO un JSON con esta forma exacta, sin texto alrededor ni bloques de código:
{
  "headline": "una frase de no más de 140 caracteres con lo más importante",
  "findings": [{"kind": "bueno" | "alerta" | "dato", "text": "una frase con el número"}],
  "actions": ["acción concreta", "..."]
}
Entre 3 y 5 findings. Entre 2 y 4 actions.`,
    messages: [{ role: "user", content: contexto }],
  });

  const text = response.content.find((c) => c.type === "text")?.text ?? "";
  // El modelo a veces envuelve el JSON en ```json; se recorta al primer objeto.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as Omit<Insights, "generatedAt">;
    if (!parsed.headline || !Array.isArray(parsed.findings)) return null;

    const value: Insights = {
      headline: String(parsed.headline).slice(0, 200),
      findings: parsed.findings
        .slice(0, 6)
        .map((f) => ({
          kind: ["bueno", "alerta", "dato"].includes(f.kind) ? f.kind : "dato",
          text: String(f.text).slice(0, 400),
        })),
      actions: (parsed.actions ?? []).slice(0, 5).map((a) => String(a).slice(0, 300)),
      generatedAt: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return null;
  }
}
