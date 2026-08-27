import { db } from "@/lib/db";

// Torre logística (Ecuador).
//
// Antes, sin conexión de Dropi, esta pantalla dibujaba provincias y tasas de
// devolución INVENTADAS, con el mismo aspecto que las reales y sin ninguna
// marca — la pantalla traía un campo "connected" que nadie leía. Un dueño
// mirando "Manabí: 15% de devoluciones" no tenía forma de saber que ese número
// no existía. Un tablero que miente es peor que un tablero vacío, así que
// ahora devuelve vacío y dice por qué.
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
  /** Por qué está vacía, cuando lo está. Se muestra tal cual en pantalla. */
  motivo?: string;
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

function sinDatos(motivo: string): LogisticsOverview {
  return {
    connected: false,
    motivo,
    totalShipments: 0,
    delivered: 0,
    returned: 0,
    inTransit: 0,
    effectivenessPct: 0,
    byProvince: [],
    byCarrier: [],
  };
}

export async function getLogisticsOverview(organizationId: string): Promise<LogisticsOverview> {
  const connection = await db.dropiConnection.findFirst({
    where: { organizationId, connectedAt: { not: null } },
  });
  if (!connection) {
    return sinDatos(
      "Todavía no hay una conexión de Dropi. Se configura en Conexiones — la API es privada y hay que pedirle la clave a su equipo."
    );
  }

  const shipments = await db.shipment.findMany({ where: { connectionId: connection.id } });
  if (shipments.length === 0) {
    // La clave puede estar guardada sin que Dropi haya habilitado todavía el
    // acceso, así que no alcanza con mirar si hay conexión.
    return sinDatos(
      "La conexión con Dropi está guardada pero todavía no bajó ninguna guía. Suele ser que falta que su equipo habilite el acceso."
    );
  }

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
    motivo: undefined,
    totalShipments: shipments.length,
    delivered,
    returned,
    inTransit: shipments.length - delivered - returned,
    effectivenessPct: effectiveness(delivered, shipments.length),
    byProvince,
    byCarrier,
  };
}
