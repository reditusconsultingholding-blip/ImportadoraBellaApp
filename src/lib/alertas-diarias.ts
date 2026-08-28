import { db } from "@/lib/db";
import { calcular, economiaDe } from "@/lib/economia";
import { avisarA } from "@/lib/push";

// Alertas diarias: qué escalar y qué apagar.
//
// El motor viejo (alerts.ts) compara los dos últimos días contra un CPA
// objetivo. Esto es distinto en dos cosas que importan:
//
// 1. Compara contra el PUNTO DE EQUILIBRIO REAL del producto — precio, costo,
//    flete, efectividad y devoluciones — no contra un umbral estimado. Un
//    producto con 90% de margen bruto y 30% de efectividad pierde plata en cada
//    venta, y contra un umbral inventado salía en verde.
//
// 2. Mira una ventana de siete días contra los siete anteriores, no dos puntos.
//    Un mal martes no es una tendencia, y apagar por un mal martes es la forma
//    más cara de equivocarse.

const VENTANA_DIAS = 7;

/** Cuánto tiene que sobrar bajo el equilibrio para valer la pena escalar. */
const MARGEN_PARA_ESCALAR = 0.75;

/** Gasto mínimo en la ventana para que la señal signifique algo. */
const GASTO_MINIMO = 150;

/** Compras mínimas: con tres ventas, un CPA no es un CPA. */
const COMPRAS_MINIMAS = 8;

export type Alerta = {
  tipo: "escalar" | "apagar" | "revisar";
  productId: string;
  code: string;
  name: string;
  mensaje: string;
  gasto: number;
  cpa: number | null;
  equilibrio: number;
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export async function calcularAlertasDiarias(organizationId: string): Promise<Alerta[]> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - VENTANA_DIAS * 24 * 3600_000);
  const desdeAnterior = new Date(ahora.getTime() - VENTANA_DIAS * 2 * 24 * 3600_000);

  const productos = await db.product.findMany({
    where: { organizationId, archived: false, efectividad: { not: null } },
    select: {
      id: true,
      code: true,
      name: true,
      salePrice: true,
      unitCost: true,
      efectividad: true,
      devoluciones: true,
      flete: true,
      gastoAdmPorPedido: true,
      campaigns: {
        select: {
          metrics: {
            where: { capturedAt: { gte: desdeAnterior } },
            select: { capturedAt: true, spend: true, purchases: true },
          },
        },
      },
    },
  });

  const alertas: Alerta[] = [];

  for (const p of productos) {
    const economia = economiaDe(p);
    if (!economia) continue;

    let gasto = 0;
    let compras = 0;
    let gastoAnterior = 0;
    let comprasAnteriores = 0;

    for (const c of p.campaigns) {
      for (const m of c.metrics) {
        if (m.capturedAt >= desde) {
          gasto += m.spend;
          compras += m.purchases;
        } else {
          gastoAnterior += m.spend;
          comprasAnteriores += m.purchases;
        }
      }
    }

    if (gasto < GASTO_MINIMO) continue;

    const cpa = compras > 0 ? gasto / compras : null;
    const cpaAnterior = comprasAnteriores > 0 ? gastoAnterior / comprasAnteriores : null;
    const { cpaBreakeven } = calcular(economia, cpa);

    // Gastó y no vendió: no hace falta esperar a la tendencia.
    if (cpa == null) {
      alertas.push({
        tipo: "apagar",
        productId: p.id,
        code: p.code,
        name: p.name,
        mensaje: `Gastó ${money(gasto)} en ${VENTANA_DIAS} días sin una sola compra atribuida.`,
        gasto,
        cpa: null,
        equilibrio: cpaBreakeven,
      });
      continue;
    }

    if (compras < COMPRAS_MINIMAS) continue;

    const tendencia =
      cpaAnterior != null && cpaAnterior > 0 ? (cpa - cpaAnterior) / cpaAnterior : null;
    const comoViene =
      tendencia == null
        ? ""
        : tendencia <= -0.1
          ? ` El CPA viene bajando ${Math.round(Math.abs(tendencia) * 100)}% contra la semana anterior.`
          : tendencia >= 0.1
            ? ` Y viene subiendo ${Math.round(tendencia * 100)}% contra la semana anterior.`
            : "";

    if (cpa <= cpaBreakeven * MARGEN_PARA_ESCALAR) {
      // Cuánto más se podría gastar antes de tocar el equilibrio: es la pregunta
      // que sigue a "escalá", y responderla acá evita que la haga otro.
      const margen = ((cpaBreakeven - cpa) / cpa) * 100;
      alertas.push({
        tipo: "escalar",
        productId: p.id,
        code: p.code,
        name: p.name,
        mensaje: `CPA de ${money2(cpa)} contra un equilibrio de ${money2(cpaBreakeven)}: aguanta ${Math.round(margen)}% más de costo por venta antes de dejar de ganar. Gastó ${money(gasto)} en ${VENTANA_DIAS} días.${comoViene}`,
        gasto,
        cpa,
        equilibrio: cpaBreakeven,
      });
      continue;
    }

    if (cpa > cpaBreakeven) {
      const exceso = ((cpa - cpaBreakeven) / cpaBreakeven) * 100;
      // La plata que se está perdiendo, que es lo que hace que se actúe.
      const perdida = (cpa - cpaBreakeven) * compras;
      alertas.push({
        tipo: "apagar",
        productId: p.id,
        code: p.code,
        name: p.name,
        mensaje: `CPA de ${money2(cpa)} contra un equilibrio de ${money2(cpaBreakeven)}: paga ${Math.round(exceso)}% de más y lleva ${money(perdida)} perdidos en ${VENTANA_DIAS} días.${comoViene}`,
        gasto,
        cpa,
        equilibrio: cpaBreakeven,
      });
      continue;
    }

    // Entre el 75% del equilibrio y el equilibrio: gana, pero poco. Solo se
    // avisa si además viene empeorando — si no, es ruido.
    if (tendencia != null && tendencia >= 0.15) {
      alertas.push({
        tipo: "revisar",
        productId: p.id,
        code: p.code,
        name: p.name,
        mensaje: `CPA de ${money2(cpa)} contra un equilibrio de ${money2(cpaBreakeven)}, y subiendo ${Math.round(tendencia * 100)}% contra la semana anterior. Todavía gana, pero va camino a no hacerlo.`,
        gasto,
        cpa,
        equilibrio: cpaBreakeven,
      });
    }
  }

  // Lo que más plata mueve primero, dentro de cada tipo.
  const orden = { apagar: 0, escalar: 1, revisar: 2 } as const;
  return alertas.sort((a, b) => orden[a.tipo] - orden[b.tipo] || b.gasto - a.gasto);
}

/** Una línea con lo que hay que hacer, para el aviso del celular. */
function resumenCorto(alertas: Alerta[]) {
  const apagar = alertas.filter((a) => a.tipo === "apagar");
  const escalar = alertas.filter((a) => a.tipo === "escalar");
  const partes: string[] = [];
  if (apagar.length > 0) {
    partes.push(
      `${apagar.length} para apagar (${money(apagar.reduce((s, a) => s + a.gasto, 0))} en juego)`
    );
  }
  if (escalar.length > 0) partes.push(`${escalar.length} para escalar`);
  return partes.join(" · ") || "Todo dentro de su punto de equilibrio.";
}

/**
 * Manda las alertas del día, una vez por día.
 *
 * Se apoya en SyncState para saber si ya se mandaron: si el reloj pasa cada
 * cinco minutos, sin ese control el equipo recibiría 288 avisos iguales.
 */
export async function enviarAlertasDiarias(organizationId: string) {
  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: "alertas-diarias" } },
    select: { okAt: true },
  });

  // Una vez cada 20 horas: da margen para que la corrida no se salte un día
  // por unos minutos de diferencia.
  if (estado?.okAt && Date.now() - estado.okAt.getTime() < 20 * 3600_000) return null;

  const alertas = await calcularAlertasDiarias(organizationId);
  const accionables = alertas.filter((a) => a.tipo !== "revisar");
  if (accionables.length === 0) {
    // Igual se marca la corrida: no hay nada que avisar, pero no hay que
    // volver a calcularlo en cinco minutos.
    await db.syncState.upsert({
      where: { organizationId_fuente: { organizationId, fuente: "alertas-diarias" } },
      create: { organizationId, fuente: "alertas-diarias", okAt: new Date(), detalle: "sin alertas" },
      update: { okAt: new Date(), detalle: "sin alertas", error: null },
    });
    return null;
  }

  const direccion = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
    select: { id: true },
  });

  for (const persona of direccion) {
    // Un solo push con el resumen, no uno por alerta: doce notificaciones
    // seguidas se descartan todas juntas sin leer ninguna.
    await avisarA(persona.id, {
      titulo: "Qué hacer hoy",
      cuerpo: resumenCorto(alertas),
      url: "/dashboard",
      etiqueta: "alertas-diarias",
    });

    for (const a of alertas.slice(0, 12)) {
      await db.notification.create({
        data: {
          userId: persona.id,
          type: a.tipo === "escalar" ? "alert_escala" : "alert_fatiga",
          message: `${a.tipo === "escalar" ? "Escalar" : a.tipo === "apagar" ? "Apagar" : "Vigilar"} · ${a.name}: ${a.mensaje}`,
          link: `/dashboard/productos/${encodeURIComponent(a.code)}`,
        },
      });
    }
  }

  const resumen = `${alertas.filter((a) => a.tipo === "escalar").length} para escalar, ${alertas.filter((a) => a.tipo === "apagar").length} para apagar`;

  await db.syncState.upsert({
    where: { organizationId_fuente: { organizationId, fuente: "alertas-diarias" } },
    create: { organizationId, fuente: "alertas-diarias", okAt: new Date(), detalle: resumen },
    update: { okAt: new Date(), detalle: resumen, error: null },
  });

  return resumen;
}
