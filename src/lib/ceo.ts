import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { getPulses } from "@/lib/pulse";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import type { Range } from "@/lib/date-range";

// Todo lo que un dueño necesita ver, en una sola consulta.
//
// Cada pestaña del panel sale de los mismos módulos que alimentan el resto de
// la app: si el CEO viera números calculados aparte, tarde o temprano no
// coincidirían con los que ve su equipo, y a partir de ahí nadie confía en
// ninguno de los dos.

export async function getPanelCeo(organizationId: string, range: Range) {
  const [ventas, meta, tiktok, rentabilidad, pulsos, alertas] = await Promise.all([
    getSalesOverview(organizationId, range),
    getOverview(organizationId, "META", range),
    getOverview(organizationId, "TIKTOK", range),
    getRentabilidad(organizationId, range),
    getPulses(organizationId, range),
    calcularAlertasDiarias(organizationId),
  ]);

  // --- Equipo: quién hizo qué. Es la pregunta que no tenía respuesta.
  const creativos = await db.requirement.findMany({
    where: {
      organizationId,
      // Sin el archivo histórico: es de otra operación y taparía al equipo
      // actual con nombres que ya no trabajan aquí.
      origen: null,
      date: { gte: range.from, lte: range.to },
    },
    select: {
      id: true,
      status: true,
      estado: true,
      cpa: true,
      hookRate: true,
      owner: { select: { id: true, name: true } },
      product: { select: { code: true, name: true } },
    },
  });

  const TERMINADO = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);
  const porEditor = new Map<
    string,
    { nombre: string; total: number; terminados: number; winners: number; cpas: number[] }
  >();

  for (const c of creativos) {
    const clave = c.owner?.id ?? "sin-asignar";
    const nombre = c.owner?.name ?? "Sin asignar";
    const acc = porEditor.get(clave) ?? {
      nombre,
      total: 0,
      terminados: 0,
      winners: 0,
      cpas: [],
    };
    acc.total += 1;
    if (TERMINADO.has(c.status)) acc.terminados += 1;
    if (c.estado && /winner/i.test(c.estado)) acc.winners += 1;
    if (c.cpa != null) acc.cpas.push(c.cpa);
    porEditor.set(clave, acc);
  }

  const equipo = [...porEditor.values()]
    .map((e) => ({
      nombre: e.nombre,
      total: e.total,
      terminados: e.terminados,
      winners: e.winners,
      // El CPA medio de sus piezas: dice si lo que produce funciona, no solo
      // cuánto produce.
      cpaMedio: e.cpas.length > 0 ? e.cpas.reduce((a, b) => a + b, 0) / e.cpas.length : null,
    }))
    .sort((a, b) => b.total - a.total);

  // --- Nómina: solo el resumen; el detalle vive en su propia pantalla con su
  // propio control de acceso.
  // Los pagos cuelgan del periodo, no de la organizacion, asi que se filtra
  // por ahi.
  const nomina = await db.payrollEntry.aggregate({
    where: { period: { organizationId, weekStart: { gte: range.from, lte: range.to } } },
    _count: true,
    _sum: { total: true },
  });

  const gastoPauta = meta.totalSpend + tiktok.totalSpend;

  return {
    resumen: {
      facturado: ventas.totalSales,
      ordenes: ventas.ordenes,
      ticket: ventas.ordenes > 0 ? ventas.totalSales / ventas.ordenes : 0,
      gastoPauta,
      // Cuánto de cada dólar facturado se fue en pauta. Es el número que dice
      // si el negocio cierra, y no depende de a quién se atribuya cada venta.
      pesoPauta: ventas.totalSales > 0 ? gastoPauta / ventas.totalSales : null,
      utilidadEstimada: rentabilidad.totales.utilidad,
      lecturas: ventas.lecturas,
      canales: ventas.channels,
      serie: ventas.salesSeries,
    },
    productos: {
      pulsos: pulsos.filter((p) => p.state !== "SIN_DATOS"),
      sinPauta: pulsos.filter((p) => p.state === "SIN_DATOS").length,
    },
    rentabilidad,
    alertas,
    equipo: {
      editores: equipo,
      totalCreativos: creativos.length,
      terminados: creativos.filter((c) => TERMINADO.has(c.status)).length,
      winners: creativos.filter((c) => c.estado && /winner/i.test(c.estado)).length,
    },
    nomina: {
      pagos: nomina._count,
      total: nomina._sum?.total ?? 0,
    },
  };
}

export type PanelCeo = Awaited<ReturnType<typeof getPanelCeo>>;
