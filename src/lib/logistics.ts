import { db } from "@/lib/db";

// Torre logística (Ecuador) — mismo patrón que src/lib/sales.ts: si hay una
// conexión real de Dropi con envíos sincronizados, se usa esa data; si no,
// se muestran datos de ejemplo para que el panel no quede vacío mientras
// Fabrizio consigue el acceso (ver nota en /dashboard/conexiones — la API
// de Dropi es privada y hay que pedirle la key a su equipo de IT).
export type ProvinceStat = {
  province: string;
  total: number;
  delivered: number;
  returned: number;
  effectivenessPct: number;
};

export type CarrierStat = {
  carrier: string;
  total: number;
  delivered: number;
  returned: number;
  effectivenessPct: number;
};

export type LogisticsOverview = {
  connected: boolean;
  totalShipments: number;
  delivered: number;
  returned: number;
  inTransit: number;
  effectivenessPct: number;
  byProvince: ProvinceStat[];
  byCarrier: CarrierStat[];
};

function effectiveness(delivered: number, total: number) {
  return total > 0 ? Math.round((delivered / total) * 1000) / 10 : 0;
}

// Distribución de ejemplo por provincia — pensada para que se note la señal
// que Fabrizio pidió: "dónde tiene más devoluciones". Manabí y Los Ríos
// quedan con más devoluciones a propósito, como ejemplo de lo que la torre
// real mostraría con datos de Dropi.
const DEMO_PROVINCES: { province: string; total: number; returnedPct: number }[] = [
  { province: "Pichincha", total: 612, returnedPct: 0.07 },
  { province: "Guayas", total: 548, returnedPct: 0.09 },
  { province: "Azuay", total: 214, returnedPct: 0.06 },
  { province: "Manabí", total: 187, returnedPct: 0.21 },
  { province: "El Oro", total: 142, returnedPct: 0.11 },
  { province: "Tungurahua", total: 121, returnedPct: 0.08 },
  { province: "Los Ríos", total: 98, returnedPct: 0.24 },
  { province: "Loja", total: 76, returnedPct: 0.10 },
  { province: "Santo Domingo", total: 64, returnedPct: 0.13 },
  { province: "Imbabura", total: 58, returnedPct: 0.09 },
];

const DEMO_CARRIERS: { carrier: string; total: number; returnedPct: number }[] = [
  { carrier: "Servientrega", total: 720, returnedPct: 0.09 },
  { carrier: "Laar Courier", total: 480, returnedPct: 0.12 },
  { carrier: "Urbano", total: 310, returnedPct: 0.10 },
  { carrier: "Tramaco", total: 210, returnedPct: 0.15 },
];

function demoLogisticsOverview(): LogisticsOverview {
  const byProvince: ProvinceStat[] = DEMO_PROVINCES.map((p) => {
    const returned = Math.round(p.total * p.returnedPct);
    const delivered = p.total - returned - Math.round(p.total * 0.04); // 4% en tránsito
    return { province: p.province, total: p.total, delivered, returned, effectivenessPct: effectiveness(delivered, p.total) };
  });

  const carrierMap = new Map<string, { total: number; returned: number }>();
  for (const c of DEMO_CARRIERS) {
    const returned = Math.round(c.total * c.returnedPct);
    const prev = carrierMap.get(c.carrier) ?? { total: 0, returned: 0 };
    carrierMap.set(c.carrier, { total: prev.total + c.total, returned: prev.returned + returned });
  }
  const byCarrier: CarrierStat[] = Array.from(carrierMap.entries()).map(([carrier, v]) => {
    const delivered = v.total - v.returned - Math.round(v.total * 0.04);
    return { carrier, total: v.total, delivered, returned: v.returned, effectivenessPct: effectiveness(delivered, v.total) };
  });

  const totalShipments = byProvince.reduce((s, p) => s + p.total, 0);
  const delivered = byProvince.reduce((s, p) => s + p.delivered, 0);
  const returned = byProvince.reduce((s, p) => s + p.returned, 0);

  return {
    connected: false,
    totalShipments,
    delivered,
    returned,
    inTransit: totalShipments - delivered - returned,
    effectivenessPct: effectiveness(delivered, totalShipments),
    byProvince: byProvince.sort((a, b) => b.effectivenessPct - a.effectivenessPct),
    byCarrier: byCarrier.sort((a, b) => b.effectivenessPct - a.effectivenessPct),
  };
}

export async function getLogisticsOverview(organizationId: string): Promise<LogisticsOverview> {
  const connection = await db.dropiConnection.findFirst({
    where: { organizationId, connectedAt: { not: null } },
  });
  if (!connection) return demoLogisticsOverview();

  // La key puede estar guardada sin que todavía haya envíos sincronizados
  // (la API real de Dropi requiere que su equipo habilite el acceso primero
  // — ver /dashboard/conexiones). Hasta que haya guías reales, se sigue
  // mostrando el ejemplo para no dejar el panel vacío.
  const shipments = await db.shipment.findMany({ where: { connectionId: connection.id } });
  if (shipments.length === 0) return demoLogisticsOverview();

  const DELIVERED = "ENTREGADO";
  const RETURNED = "DEVUELTO";

  function summarize<K extends string>(list: typeof shipments, keyOf: (s: (typeof shipments)[number]) => K) {
    const map = new Map<K, { total: number; delivered: number; returned: number }>();
    for (const s of list) {
      const key = keyOf(s);
      const prev = map.get(key) ?? { total: 0, delivered: 0, returned: 0 };
      prev.total++;
      if (s.status === DELIVERED) prev.delivered++;
      if (s.status === RETURNED || s.isReturn) prev.returned++;
      map.set(key, prev);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v, effectivenessPct: effectiveness(v.delivered, v.total) }))
      .sort((a, b) => b.effectivenessPct - a.effectivenessPct);
  }

  const byProvince = summarize(shipments, (s) => s.province).map((v) => ({
    province: v.key,
    total: v.total,
    delivered: v.delivered,
    returned: v.returned,
    effectivenessPct: v.effectivenessPct,
  }));
  const byCarrier = summarize(shipments, (s) => s.carrier).map((v) => ({
    carrier: v.key,
    total: v.total,
    delivered: v.delivered,
    returned: v.returned,
    effectivenessPct: v.effectivenessPct,
  }));

  const delivered = shipments.filter((s) => s.status === DELIVERED).length;
  const returned = shipments.filter((s) => s.status === RETURNED || s.isReturn).length;

  return {
    connected: true,
    totalShipments: shipments.length,
    delivered,
    returned,
    inTransit: shipments.length - delivered - returned,
    effectivenessPct: effectiveness(delivered, shipments.length),
    byProvince,
    byCarrier,
  };
}
