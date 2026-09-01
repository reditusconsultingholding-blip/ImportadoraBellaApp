import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { getPatronesClientes } from "@/lib/clientes";
import { getPulses } from "@/lib/pulse";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import { resolveRange, type RangeId } from "@/lib/date-range";
import { resumenDelDia, localToday } from "@/lib/contenido";
import { reporteDeProducto } from "@/lib/reportes-producto";

// Las herramientas con las que Jarvis consulta el negocio.
//
// Antes recibía un resumen fijo armado de antemano y contestaba con eso. Si le
// preguntabas la utilidad de un producto o el detalle de una campaña, no tenía
// cómo ir a buscarlo y respondía que no tenía la información — que era cierto,
// y era exactamente el problema.
//
// Ahora pregunta. Cada herramienta devuelve los mismos números que muestra el
// panel, calculados por las mismas funciones: si el panel y Jarvis se
// contradijeran, uno de los dos miente y no habría forma de saber cuál.

const PERIODOS = ["hoy", "ayer", "7d", "30d", "3m", "6m", "9m", "12m"];

const periodo = {
  type: "string" as const,
  enum: PERIODOS,
  description: "Período a mirar. Por defecto 30d.",
};

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "ventas",
    description:
      "Ventas reales de Shopify: facturado, número de órdenes, ticket promedio, desglose por canal de venta y comparación contra el período anterior. Es la plata que entró de verdad, no la atribuida por las plataformas de pauta.",
    input_schema: { type: "object", properties: { periodo } },
  },
  {
    name: "pauta",
    description:
      "Gasto en publicidad de Meta y TikTok: inversión, impresiones, clics, compras atribuidas y CPA. Las compras acá son las que la plataforma se adjudica, que suelen ser bastante más que las órdenes reales.",
    input_schema: {
      type: "object",
      properties: { periodo, plataforma: { type: "string", enum: ["META", "TIKTOK", "ambas"] } },
    },
  },
  {
    name: "rentabilidad",
    description:
      "Utilidad por producto con la economía real de contraentrega: precio, costo, flete, efectividad de entrega y devoluciones. Devuelve ingreso, costos, utilidad, margen, CPA actual, CPA de equilibrio y CPA objetivo de cada producto. Es la herramienta para cualquier pregunta sobre si algo gana o pierde plata.",
    input_schema: {
      type: "object",
      properties: {
        periodo,
        filtro: {
          type: "string",
          enum: ["todos", "ganan", "pierden"],
          description: "Por defecto todos.",
        },
        limite: { type: "number", description: "Cuántos productos devolver. Por defecto 15." },
      },
    },
  },
  {
    name: "producto",
    description:
      "Todo lo que se sabe de UN producto: su ficha económica, su pulso, su gasto y sus campañas. Se busca por código o por nombre parcial.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "Código o parte del nombre." },
        periodo,
      },
      required: ["busqueda"],
    },
  },
  {
    name: "campanas",
    description:
      "Las campañas de pauta con su gasto, compras atribuidas y CPA, ordenadas por gasto. Sirve para ver dónde se está yendo la plata.",
    input_schema: {
      type: "object",
      properties: {
        periodo,
        plataforma: { type: "string", enum: ["META", "TIKTOK", "ambas"] },
        limite: { type: "number", description: "Por defecto 15." },
      },
    },
  },
  {
    name: "clientes",
    description:
      "Patrones de los clientes: cuántos son, cuántos repiten compra, en qué provincias se vende y qué productos se compran juntos. Se identifica por teléfono.",
    input_schema: { type: "object", properties: { periodo } },
  },
  {
    name: "pulso",
    description:
      "El estado de salud de cada producto con pauta: sano, vigilar o en riesgo, con el puntaje y los motivos. Es el semáforo del panel.",
    input_schema: { type: "object", properties: { periodo } },
  },
  {
    name: "que_hacer_hoy",
    description:
      "Las alertas del día: qué campañas conviene escalar y cuáles apagar, con el porqué de cada una medido contra el CPA de equilibrio real.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "tareas_hoy",
    description:
      "El tablero de tareas de hoy del equipo creativo, por persona: cuántas tareas tiene cada quien, cuántas hechas, cuántas pendientes, cuántas por pautar y cuántos creativos entregó. Sin cifras de dinero.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "mejor_campana_producto",
    description:
      "Para un producto, cuál de sus campañas rinde mejor y cuál peor, qué formato es el winner y el resumen del período (quincenal). Se busca por código o nombre del producto.",
    input_schema: {
      type: "object",
      properties: { busqueda: { type: "string", description: "Código o parte del nombre del producto." } },
      required: ["busqueda"],
    },
  },
];

const num = (n: number | null | undefined, dec = 2) =>
  n == null ? null : Math.round(n * 10 ** dec) / 10 ** dec;

function rango(p: unknown) {
  const id = typeof p === "string" && PERIODOS.includes(p) ? (p as RangeId) : ("30d" as RangeId);
  return resolveRange(id);
}

/**
 * Corre una herramienta y devuelve el resultado como texto para el modelo.
 *
 * Se devuelve JSON y no prosa a propósito: con una frase ya redactada, el
 * modelo la repite tal cual. Con los números crudos razona sobre ellos.
 */
export async function correrHerramienta(
  organizationId: string,
  nombre: string,
  entrada: Record<string, unknown>
): Promise<string> {
  const r = rango(entrada.periodo);

  switch (nombre) {
    case "ventas": {
      const v = await getSalesOverview(organizationId, r);
      return JSON.stringify({
        periodo: r.label,
        facturado: num(v.totalSales),
        ordenes: v.ordenes,
        ticketPromedio: num(v.aov),
        porCanal: v.channels.map((c) => ({ canal: c.label, monto: num(c.value) })),
      });
    }

    case "pauta": {
      const pedir = async (p: "META" | "TIKTOK") => {
        const o = await getOverview(organizationId, p, r);
        return {
          plataforma: p,
          gasto: num(o.totalSpend),
          comprasAtribuidas: o.totalPurchases,
          ingresoAtribuido: num(o.totalRevenue),
          cpa: o.totalPurchases > 0 ? num(o.totalSpend / o.totalPurchases) : null,
          roas: num(o.roas),
          ctr: num(o.ctr, 4),
          clics: o.rows.reduce((s, f) => s + f.clicks, 0),
          impresiones: o.rows.reduce((s, f) => s + f.impressions, 0),
          campanasSinProductoAsociado: o.campaignsWithoutProduct,
        };
      };
      const cual = entrada.plataforma;
      const datos =
        cual === "META"
          ? [await pedir("META")]
          : cual === "TIKTOK"
            ? [await pedir("TIKTOK")]
            : [await pedir("META"), await pedir("TIKTOK")];
      return JSON.stringify({ periodo: r.label, plataformas: datos });
    }

    case "rentabilidad": {
      const rent = await getRentabilidad(organizationId, r);
      const limite = typeof entrada.limite === "number" ? entrada.limite : 15;
      let filas = rent.filas.filter((f) => f.tieneEconomia);
      if (entrada.filtro === "ganan") filas = filas.filter((f) => (f.utilidad ?? 0) > 0);
      if (entrada.filtro === "pierden") filas = filas.filter((f) => (f.utilidad ?? 0) < 0);
      filas = [...filas].sort((a, b) => (b.utilidad ?? 0) - (a.utilidad ?? 0));

      return JSON.stringify({
        periodo: r.label,
        totales: {
          gastoPauta: num(rent.totales.gastoPauta),
          ingreso: num(rent.totales.ingreso),
          utilidad: num(rent.totales.utilidad),
          productosConEconomiaCargada: rent.totales.conEconomia,
          productosSinEconomia: rent.totales.sinEconomia,
        },
        // El contraste va SIEMPRE. Una utilidad calculada sobre compras
        // atribuidas se lee como plata en el banco si no se dice al lado
        // cuántas órdenes hubo de verdad.
        contraste: {
          ordenesRealesShopify: rent.contraste.ordenesShopify,
          facturadoRealShopify: num(rent.contraste.facturadoShopify),
          vecesQueLaPautaSobreatribuye: num(rent.contraste.vecesAtribuido),
        },
        productos: filas.slice(0, limite).map((f) => ({
          codigo: f.code,
          nombre: f.name,
          gastoPauta: num(f.gastoPauta),
          comprasAtribuidas: f.comprasAtribuidas,
          cpa: num(f.cpa),
          cpaBreakeven: num(f.cpaBreakeven),
          cpaObjetivo: num(f.cpaObjetivo),
          efectividadEntrega: num(f.efectividad, 3),
          devoluciones: num(f.devoluciones, 3),
          ingreso: num(f.ingreso),
          costoMercaderia: num(f.costoMercaderia),
          costoFlete: num(f.costoFlete),
          utilidad: num(f.utilidad),
          margen: num(f.margen, 3),
          economiaCalculadaCon: f.economiaDe,
        })),
      });
    }

    case "producto": {
      const busqueda = String(entrada.busqueda ?? "").trim();
      if (!busqueda) return JSON.stringify({ error: "Falta qué producto buscar." });

      const productos = await db.product.findMany({
        where: {
          organizationId,
          archived: false,
          OR: [
            { code: { contains: busqueda, mode: "insensitive" } },
            { name: { contains: busqueda, mode: "insensitive" } },
          ],
        },
        take: 5,
      });
      if (productos.length === 0) return JSON.stringify({ encontrado: false, busqueda });

      const [rent, pulsos] = await Promise.all([
        getRentabilidad(organizationId, r),
        getPulses(organizationId, r),
      ]);

      const detalle = await Promise.all(
        productos.map(async (p) => {
          const campanas = await db.campaign.findMany({
            where: { productId: p.id },
            select: {
              name: true,
              status: true,
              // La plataforma vive en la cuenta publicitaria, no en la campaña.
              adAccount: { select: { platform: true } },
            },
            take: 25,
          });
          const fila = rent.filas.find((f) => f.code === p.code);
          const pulso = pulsos.find((x) => x.code === p.code);
          return {
            codigo: p.code,
            nombre: p.name,
            ficha: {
              precioVenta: num(p.salePrice),
              costoUnitario: num(p.unitCost),
              efectividadEntrega: num(p.efectividad, 3),
              devoluciones: num(p.devoluciones, 3),
            },
            pulso: pulso
              ? { estado: pulso.state, puntaje: pulso.score, motivos: pulso.motivos }
              : null,
            economia: fila
              ? {
                  gastoPauta: num(fila.gastoPauta),
                  comprasAtribuidas: fila.comprasAtribuidas,
                  cpa: num(fila.cpa),
                  cpaBreakeven: num(fila.cpaBreakeven),
                  cpaObjetivo: num(fila.cpaObjetivo),
                  utilidad: num(fila.utilidad),
                  margen: num(fila.margen, 3),
                }
              : null,
            campanas: campanas.map((c) => ({
              nombre: c.name,
              plataforma: c.adAccount.platform,
              estado: c.status,
            })),
          };
        })
      );

      return JSON.stringify({ periodo: r.label, encontrado: true, productos: detalle });
    }

    case "campanas": {
      const limite = typeof entrada.limite === "number" ? entrada.limite : 15;
      const cual = entrada.plataforma;

      // Se reusan las filas de getOverview y no una consulta propia: son las
      // mismas que muestra el panel, con el mismo semáforo y el mismo CPA
      // objetivo. Una consulta paralela podría dar otro número para lo mismo.
      const cuales: ("META" | "TIKTOK")[] =
        cual === "META" ? ["META"] : cual === "TIKTOK" ? ["TIKTOK"] : ["META", "TIKTOK"];

      const filas = (
        await Promise.all(
          cuales.map(async (p) => {
            const o = await getOverview(organizationId, p, r);
            return o.rows.map((f) => ({ ...f, plataforma: p }));
          })
        )
      ).flat();

      filas.sort((a, b) => b.spend - a.spend);

      return JSON.stringify({
        periodo: r.label,
        campanas: filas.slice(0, limite).map((f) => ({
          nombre: f.name,
          plataforma: f.plataforma,
          productoAsociado: f.code,
          estado: f.status,
          gasto: num(f.spend),
          comprasAtribuidas: f.purchases,
          ingresoAtribuido: num(f.revenue),
          cpa: num(f.cpa),
          cpaObjetivo: num(f.cpaTarget),
          clics: f.clicks,
          impresiones: f.impressions,
        })),
      });
    }

    case "clientes": {
      const c = await getPatronesClientes(organizationId, r);
      return JSON.stringify({
        periodo: r.label,
        totales: {
          clientesIdentificados: c.totales.clientes,
          ordenes: c.totales.ordenes,
          porcionQueRepiten: num(c.totales.porcionRepiten, 3),
          ordenesSinTelefono: c.totales.sinTelefono,
        },
        // Sin esta advertencia, "el 8% repite" se lee como un hecho de la
        // operación cuando todavía puede ser un hecho de los datos que faltan.
        advertencia:
          c.totales.sinTelefono > 0
            ? c.totales.sinTelefono +
              " órdenes del período no tienen teléfono y no se pueden agrupar por cliente. Todo porcentaje de recompra es un piso, no la cifra real."
            : null,
        porProvincia: c.porProvincia.slice(0, 15),
        productosQueSeCompranJuntos: c.combinaciones.slice(0, 10),
      });
    }

    case "pulso": {
      const p = await getPulses(organizationId, r);
      return JSON.stringify({
        periodo: r.label,
        productos: p
          .filter((x) => x.state !== "SIN_DATOS")
          .map((x) => ({
            codigo: x.code,
            nombre: x.name,
            estado: x.state,
            puntaje: x.score,
            gasto: num(x.spend),
            comprasAtribuidas: x.purchases,
            cpa: num(x.cpa),
            cpaObjetivo: num(x.cpaTarget),
            motivos: x.motivos,
          })),
      });
    }

    case "que_hacer_hoy": {
      const a = await calcularAlertasDiarias(organizationId);
      return JSON.stringify({
        alertas: a.map((x) => ({ tipo: x.tipo, producto: x.name, mensaje: x.mensaje })),
      });
    }

    case "tareas_hoy": {
      const res = await resumenDelDia(organizationId, localToday());
      return JSON.stringify({
        totalTareas: res.totalTareas,
        totalHechas: res.totalHechas,
        totalPendientes: res.totalPendientes,
        totalPorPautar: res.totalPorPautar,
        totalCreativos: res.totalCreativos,
        sinResponsable: res.sinResponsable,
        porPersona: res.porPersona.map((p) => ({
          nombre: p.nombre,
          tareas: p.tareas,
          hechas: p.hechas,
          pendientes: p.pendientes,
          porPautar: p.porPautar,
          noCumplidas: p.noCumplidas,
          creativos: p.creativos,
        })),
      });
    }

    case "mejor_campana_producto": {
      const busqueda = String(entrada.busqueda ?? "").trim();
      if (!busqueda) return JSON.stringify({ error: "Falta qué producto buscar." });
      const p = await db.product.findFirst({
        where: {
          organizationId,
          archived: false,
          OR: [
            { code: { contains: busqueda, mode: "insensitive" } },
            { name: { contains: busqueda, mode: "insensitive" } },
          ],
        },
        select: { code: true },
      });
      if (!p) return JSON.stringify({ encontrado: false, busqueda });
      const rep = await reporteDeProducto(organizationId, p.code, "quincenal");
      if (!rep) return JSON.stringify({ encontrado: false, busqueda });
      return JSON.stringify({
        encontrado: true,
        producto: rep.nombre,
        periodo: "últimos 15 días",
        mejorCampana: rep.mejorCampana,
        peorCampana: rep.peorCampana,
        formatoWinner: rep.formatoWinner,
        winners: rep.winners,
        comprasTotal: rep.comprasTotal,
        gastoTotal: rep.gastoTotal,
        cpaPromedio: rep.cpaPromedio,
      });
    }

    default:
      return JSON.stringify({ error: "No existe la herramienta " + nombre + "." });
  }
}

/**
 * Las herramientas que puede usar quien NO ve el dinero.
 *
 * No alcanza con esconder la pantalla de Rentabilidad: si Jarvis puede
 * consultarla, basta preguntarle "¿cuánto facturamos?" y la regla se cae por
 * la puerta de atrás. Así que a quien no tiene el permiso se le entregan menos
 * herramientas — no se le pide al modelo que se abstenga, que sería confiar en
 * que obedezca.
 *
 * Quedan fuera las que devuelven plata: ventas, pauta, rentabilidad, campañas
 * y clientes. Queda dentro el pulso, que dice si un producto está sano y si
 * conviene escalar sin decir cuánto cuesta, y que es exactamente lo que el
 * equipo creativo necesita para decidir qué producir.
 */
const SIN_DINERO = new Set(["pulso", "tareas_hoy", "mejor_campana_producto"]);

/** Los campos con cifras se quitan del resultado, no se redondean. */
const CAMPOS_CON_PLATA = new Set([
  "gasto",
  "gastoPauta",
  "gastoTotal",
  "cpa",
  "cpaObjetivo",
  "cpaBreakeven",
  "cpaPromedio",
  "ingreso",
  "ingresoAtribuido",
  "ingresoTotal",
  "facturado",
  "utilidad",
  "precio",
  "precioVenta",
  "costoUnitario",
  "costoMercaderia",
  "costoFlete",
  "ticketPromedio",
  "margen",
]);

export function herramientasPara(veFinanzas: boolean) {
  return veFinanzas ? HERRAMIENTAS : HERRAMIENTAS.filter((h) => SIN_DINERO.has(h.name));
}

/**
 * Saca las cifras de un resultado antes de dárselo al modelo.
 *
 * El pulso trae gasto y CPA junto al veredicto. Se podrían haber sacado dentro
 * de cada herramienta, pero entonces cada herramienta nueva tendría que
 * acordarse de hacerlo — y la que se olvide filtra. Acá pasa todo por un solo
 * lugar.
 *
 * Se BORRA la clave en vez de ponerla en cero: un cero se lee como un dato y
 * el modelo lo repetiría como si fuera cierto.
 */
export function sinCifras(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinCifras);
  if (valor && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CAMPOS_CON_PLATA.has(k)) continue;
      salida[k] = sinCifras(v);
    }
    return salida;
  }
  return valor;
}
