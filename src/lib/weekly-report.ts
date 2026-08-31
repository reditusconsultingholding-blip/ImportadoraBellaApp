import { db } from "@/lib/db";
import { getPulses } from "@/lib/pulse";
import { resolveRange } from "@/lib/date-range";

// El reporte semanal de salud de productos, para el CEO.
//
// El reporte diario cuenta cómo fue el día; este cuenta cómo viene cada
// producto. Es la diferencia entre mirar el termómetro y mirar la curva: un
// producto puede tener un buen martes y estar perdiendo terreno hace tres
// semanas, y eso solo se ve poniendo los días uno al lado del otro.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** El lunes de la semana a la que pertenece una fecha, en hora de Ecuador. */
export function lunesDeLaSemana(referencia: Date) {
  const enEcuador = new Date(referencia.getTime() - 5 * 3600_000);
  const dia = enEcuador.getUTCDay(); // 0 domingo … 6 sábado
  const alLunes = dia === 0 ? 6 : dia - 1;
  return new Date(
    Date.UTC(
      enEcuador.getUTCFullYear(),
      enEcuador.getUTCMonth(),
      enEcuador.getUTCDate() - alLunes
    )
  );
}

/**
 * Arma el reporte de la semana que cerró, si todavía no se armó.
 *
 * Devuelve null cuando no había nada que hacer — o porque ya se envió, o
 * porque no hubo pauta en la semana. Un correo diciendo "no pasó nada" cada
 * lunes es la forma más rápida de que dejen de abrirlo.
 */
export async function enviarReporteSemanal(organizationId: string, referencia = new Date()) {
  // La semana que se resume es la ANTERIOR a la que corre: el lunes se manda
  // el cierre de la semana pasada, no un resumen a medio hacer de la actual.
  const lunesActual = lunesDeLaSemana(referencia);
  const lunesPasado = new Date(lunesActual);
  lunesPasado.setUTCDate(lunesPasado.getUTCDate() - 7);
  const domingoPasado = new Date(lunesActual);
  domingoPasado.setUTCDate(domingoPasado.getUTCDate() - 1);

  const yaFue = await db.weeklyReport.findUnique({
    where: { organizationId_weekStart: { organizationId, weekStart: lunesPasado } },
    select: { id: true },
  });
  if (yaFue) return null;

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const range = resolveRange("personalizado", iso(lunesPasado), iso(domingoPasado));

  const [pulsos, ventas] = await Promise.all([
    getPulses(organizationId, range),
    db.shopifyOrder.aggregate({
      where: {
        store: { organizationId },
        occurredAt: { gte: range.fromInstant, lte: range.toInstant },
      },
      _sum: { netSales: true },
    }),
  ]);

  const conPauta = pulsos.filter((p) => p.state !== "SIN_DATOS");
  if (conPauta.length === 0) return null;

  const gasto = conPauta.reduce((s, p) => s + p.spend, 0);
  const facturado = ventas._sum.netSales ?? 0;

  const enRiesgo = conPauta.filter((p) => p.state === "RIESGO").length;
  const resumen =
    enRiesgo > 0
      ? `${enRiesgo} de ${conPauta.length} productos en riesgo · ${money(gasto)} de pauta · ${money(facturado)} facturado`
      : `Los ${conPauta.length} productos con pauta dentro de su objetivo · ${money(gasto)} de pauta · ${money(facturado)} facturado`;

  // El aviso vive dentro de la app: el reporte ya no sale por correo.
  // El resumen lleva el gasto y el facturado de la semana dentro del texto, así
  // que va con el permiso de finanzas y no solo con el rol.
  const duenos = await db.user.findMany({
    where: { organizationId, role: "OWNER", canViewFinancials: true },
    select: { id: true },
  });
  for (const d of duenos) {
    await db.notification.create({
      data: {
        userId: d.id,
        type: "daily_report",
        message: `Reporte semanal de productos: ${resumen}`,
        link: "/dashboard/productos",
      },
    });
  }

  await db.weeklyReport.create({
    data: {
      organizationId,
      weekStart: lunesPasado,
      enviadoA: "aviso dentro de la app",
      resumen,
    },
  });

  return resumen;
}
