// Vista de ventas de la tienda completa (Shopify), separada del rendimiento
// por campaña de Meta/TikTok — acá entran todos los productos del catálogo,
// se anuncien o no. Datos de ejemplo hasta que conectemos la Admin API real
// de Shopify (mismo patrón que Conexiones para Meta/TikTok).

function hourLabel(h: number) {
  if (h === 0) return "12 a. m.";
  if (h < 12) return `${h} a. m.`;
  if (h === 12) return "12 p. m.";
  return `${h - 12} p. m.`;
}

export type SalesPoint = { hour: string; today: number; yesterday: number };

function buildSeries(peakToday: number, peakYesterday: number, seedOffset: number): SalesPoint[] {
  return Array.from({ length: 12 }, (_, i) => {
    const h = i * 2;
    const wave = (base: number, phase: number) =>
      Math.max(0, base * (0.35 + 0.65 * Math.sin((i + phase) / 2.1) ** 2));
    return {
      hour: hourLabel(h),
      today: Math.round(wave(peakToday, seedOffset)),
      yesterday: Math.round(wave(peakYesterday, seedOffset + 1.3)),
    };
  });
}

export type SalesOverview = {
  totalSales: number;
  totalSalesChangePct: number;
  salesSeries: SalesPoint[];
  breakdown: { label: string; value: number; changePct: number | null }[];
  channels: { label: string; value: number; changePct: number }[];
  aov: number;
  aovChangePct: number;
  aovSeries: SalesPoint[];
  topProducts: { name: string; category: string; value: number; changePct: number; share: number }[];
};

export type HeaderStat = {
  label: string;
  value: number;
  changePct: number | null;
  format: "compact" | "count" | "percent";
  isMoney?: boolean;
};

// Resumen de más alto nivel para el header fijo — ventana más amplia
// (ej. últimos 30 días) que el detalle "hoy vs. ayer" de las tarjetas.
export function getHeaderStats(): HeaderStat[] {
  return [
    { label: "Sesiones", value: 140200, changePct: 523, format: "compact" },
    { label: "Ventas totales", value: 298000, changePct: 68, format: "compact", isMoney: true },
    { label: "Pedidos", value: 8229, changePct: 62, format: "count" },
    { label: "Tasa de conversión", value: 0, changePct: null, format: "percent" },
  ];
}

export function getSalesOverview(): SalesOverview {
  const grossSales = 4325.04;
  const discounts = -322.83;
  const netSales = grossSales + discounts;

  return {
    totalSales: netSales,
    totalSalesChangePct: 14,
    salesSeries: buildSeries(430, 340, 0),
    breakdown: [
      { label: "Ventas brutas", value: grossSales, changePct: 13 },
      { label: "Descuentos", value: discounts, changePct: -2 },
      { label: "Reversiones de ventas", value: 0, changePct: null },
      { label: "Ventas netas", value: netSales, changePct: 14 },
      { label: "Cargos de envío", value: 0, changePct: null },
      { label: "Cargos por devolución", value: 0, changePct: null },
      { label: "Impuestos", value: 0, changePct: null },
      { label: "Ventas totales", value: netSales, changePct: 14 },
    ],
    channels: [
      { label: "Funnelish", value: 2905.6, changePct: 14 },
      { label: "Releasit COD Form", value: 1096.61, changePct: 14 },
    ],
    aov: 35.41,
    aovChangePct: 1,
    aovSeries: buildSeries(70, 66, 2),
    topProducts: [
      { name: "Té para el cuidado del hígado", category: "Salud", value: 931, changePct: 22, share: 0.64 },
      { name: "Truly Post Afeitado", category: "Belleza", value: 909, changePct: 22, share: 0.54 },
      { name: "Dr. Althea · 345 Relief Cream", category: "Belleza", value: 659, changePct: 20, share: 0.73 },
      { name: "Té Ginseng para los Riñones", category: "Salud", value: 512, changePct: 18, share: 0.47 },
    ],
  };
}
