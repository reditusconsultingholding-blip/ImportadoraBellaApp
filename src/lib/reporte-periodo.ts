import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import type { Range } from "@/lib/date-range";
import { getOverview } from "@/lib/metrics";
import { getSalesOverview } from "@/lib/sales";
import { getRentabilidad } from "@/lib/rentabilidad";
import { calcularAlertasDiarias } from "@/lib/alertas-diarias";
import { LIMITE_PESO_PAUTA, NOMBRE_GRANULARIDAD } from "@/lib/reporte-medidas";
import { serieDelPeriodo } from "@/lib/reporte-serie";
import {
  barras,
  encabezado,
  moneda,
  moneda2,
  nota,
  pie,
  recuadro,
  seccion,
  tarjetas,
  torta,
} from "@/lib/pdf-dibujo";

// El informe de un período cualquiera, en PDF.
//
// El reporte diario cubre un día y sale solo al cierre; este lo pide alguien
// desde la pantalla de Reportes con el período que eligió — una semana, un
// mes, entre dos fechas. Comparte las piezas de dibujo con el diario a
// propósito: dos PDF de la misma empresa que no se parecen entre sí obligan a
// aprender a leer dos veces.
//
// Lo que cambia respecto del diario es qué se puede afirmar. En un día, "el
// gasto fue $1.500" es un dato; en tres meses, lo que se decide es cuánto de
// lo facturado se va en pauta. Por eso la serie va con el porcentaje al lado.

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

/** Cómo se llama el archivo que se baja. */
export function nombreDelInforme(range: Range) {
  return `informe-${isoDia(range.from)}_a_${isoDia(range.to)}.pdf`;
}

export async function construirInformeDePeriodo(
  organizationId: string,
  range: Range
): Promise<Buffer> {
  const [org, sales, meta, tiktok, rentabilidad, serie, alertas] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId } }),
    getSalesOverview(organizationId, range),
    getOverview(organizationId, "META", range),
    getOverview(organizationId, "TIKTOK", range),
    getRentabilidad(organizationId, range),
    serieDelPeriodo(organizationId, range),
    calcularAlertasDiarias(organizationId),
  ]);

  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const listo = new Promise<Buffer>((resolve) =>
    doc.on("end", () => resolve(Buffer.concat(chunks)))
  );

  const bonito = (d: Date) =>
    d.toLocaleDateString("es-EC", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const mismoDia = isoDia(range.from) === isoDia(range.to);
  const cuando = mismoDia ? bonito(range.from) : `${bonito(range.from)} — ${bonito(range.to)}`;

  encabezado(doc, org?.name ?? "Importadora Bella", `Informe de ${range.label} · ${cuando}`);

  const gastoPauta = meta.totalSpend + tiktok.totalSpend;
  const pesoPauta = serie.totales.pesoPauta;

  tarjetas(doc, [
    {
      label: "Facturado",
      valor: moneda(sales.totalSales),
      nota: `${sales.ordenes} órdenes`,
    },
    {
      label: "Ticket promedio",
      valor: moneda2(sales.aov),
      nota: `${sales.totalSalesChangePct >= 0 ? "+" : ""}${sales.totalSalesChangePct}% vs. el período anterior`,
    },
    {
      label: "Gasto en pauta",
      valor: moneda(gastoPauta),
      nota: pesoPauta == null ? "sin facturación" : `${Math.round(pesoPauta)}% de lo facturado`,
      tono: pesoPauta != null && pesoPauta > LIMITE_PESO_PAUTA ? "mal" : "neutro",
    },
    {
      label: "Utilidad estimada",
      valor: moneda(rentabilidad.totales.utilidad),
      nota: "tras mercadería y flete",
      tono: rentabilidad.totales.utilidad >= 0 ? "bien" : "mal",
    },
  ]);

  if (!sales.connected) {
    nota(
      doc,
      "No hay una tienda de Shopify conectada: la facturación de este informe está en cero porque no hay de dónde leerla, no porque no se haya vendido."
    );
  } else if (sales.ventasDesde && sales.ventasDesde.slice(0, 10) > isoDia(range.from)) {
    // El período arranca antes de la orden más vieja que hay guardada. Sin
    // decirlo, el informe muestra la pauta completa contra ventas a medias y
    // parece un desastre cuando lo que falta es historia.
    nota(
      doc,
      `Las órdenes guardadas empiezan el ${sales.ventasDesde.slice(0, 10)}, después del inicio de este período: lo anterior a esa fecha tiene gasto en pauta pero no ventas con las cuales compararlo.`
    );
  }

  // --- Qué hacer. Va arriba de todo lo demás, igual que en el diario: es lo
  // único que cambia lo que alguien hace después de leerlo. Van TODAS las
  // recomendaciones; si la lista es larga, el recuadro se parte en páginas.
  const linea = (a: (typeof alertas)[number]) => `${a.name}: ${a.mensaje}`;
  const paraApagar = alertas.filter((a) => a.tipo === "apagar");
  const paraEscalar = alertas.filter((a) => a.tipo === "escalar");
  const paraVigilar = alertas.filter((a) => a.tipo === "revisar");

  seccion(doc, "Qué hacer con la pauta");
  nota(
    doc,
    "Estas recomendaciones NO dependen del período elegido: salen siempre de los últimos 7 días contra los 7 anteriores, que es la ventana con la que se decide escalar o apagar. Un promedio de tres meses no sirve para decidir hoy."
  );

  if (paraApagar.length > 0) {
    recuadro(
      doc,
      `${paraApagar.length} ${paraApagar.length === 1 ? "producto está" : "productos están"} por encima de su punto de equilibrio`,
      paraApagar.map(linea),
      "mal"
    );
  }
  if (paraEscalar.length > 0) {
    recuadro(
      doc,
      `${paraEscalar.length} ${paraEscalar.length === 1 ? "producto aguanta" : "productos aguantan"} más presupuesto`,
      paraEscalar.map(linea),
      "bien"
    );
  }
  if (paraVigilar.length > 0) {
    recuadro(
      doc,
      `${paraVigilar.length} ${paraVigilar.length === 1 ? "producto todavía gana" : "productos todavía ganan"}, pero el CPA viene subiendo`,
      paraVigilar.map(linea),
      "neutro"
    );
  }
  if (alertas.length === 0) {
    recuadro(
      doc,
      "Nada para apagar ni para escalar",
      [
        "Ningún producto con pauta suficiente quedó fuera de su punto de equilibrio en los últimos 7 días.",
      ],
      "bien"
    );
  }

  // --- La serie del período. La barra mide el facturado; al lado va el peso
  // de la pauta, que es el número con el que se juzga si ese facturado costó
  // caro. Puestos en la misma barra se compararían dos escalas que no tienen
  // nada que ver.
  if (serie.cubos.length > 0) {
    seccion(doc, `Facturado ${NOMBRE_GRANULARIDAD[serie.granularidad]}`);
    barras(
      doc,
      serie.cubos.map((c) => ({
        label: c.detalle,
        valor: c.facturado,
        nota:
          c.pesoPauta == null
            ? `${moneda(c.facturado)} · sin ventas`
            : `${moneda(c.facturado)} · ${Math.round(c.pesoPauta)}% pauta`,
      }))
    );
    nota(
      doc,
      `El porcentaje es cuánto de lo facturado se fue en pauta. Por encima de ${LIMITE_PESO_PAUTA}% la pauta se está comiendo el negocio.`
    );
  }

  // --- De dónde vino la plata.
  if (sales.channels.length > 0) {
    seccion(doc, "Ventas por canal");
    torta(
      doc,
      sales.channels.map((c) => ({ label: c.label, valor: c.value }))
    );
  }

  if (sales.topProducts.length > 0) {
    seccion(doc, "Productos que más vendieron");
    barras(
      doc,
      sales.topProducts.map((p) => ({ label: p.name, valor: p.value }))
    );
    nota(doc, "Solo los que más facturaron. El listado completo está en Ventas, en el panel.");
  }

  // --- La pauta, plataforma por plataforma.
  seccion(doc, "Pauta");
  tarjetas(doc, [
    {
      label: "Meta · gasto",
      valor: moneda(meta.totalSpend),
      nota: `${meta.totalPurchases} compras · CTR ${meta.ctr.toFixed(2)}%`,
    },
    {
      label: "TikTok · gasto",
      valor: moneda(tiktok.totalSpend),
      nota: `${tiktok.totalPurchases} compras · CTR ${tiktok.ctr.toFixed(2)}%`,
    },
    {
      label: "Compras atribuidas",
      valor: String(meta.totalPurchases + tiktok.totalPurchases),
      nota: `contra ${sales.ordenes} órdenes reales`,
    },
  ]);
  nota(
    doc,
    "Las compras de Meta y TikTok son ATRIBUIDAS: cada plataforma se cuelga la venta que cree suya, así que suelen sumar bastante más que las órdenes reales de Shopify. La utilidad de la sección siguiente se calcula sobre ellas, así que es una estimación optimista."
  );

  // --- Utilidad por producto.
  const conUtilidad = rentabilidad.filas
    .filter((f) => f.utilidad != null)
    .sort((a, b) => (b.utilidad ?? 0) - (a.utilidad ?? 0));
  const TOPE_UTILIDAD = 20;
  if (conUtilidad.length > 0) {
    seccion(doc, "Utilidad estimada por producto");
    barras(
      doc,
      conUtilidad.slice(0, TOPE_UTILIDAD).map((f) => ({ label: f.name, valor: f.utilidad ?? 0 }))
    );
    if (conUtilidad.length > TOPE_UTILIDAD) {
      nota(
        doc,
        `${TOPE_UTILIDAD} de ${conUtilidad.length} productos con economía cargada. Los otros ${conUtilidad.length - TOPE_UTILIDAD} están en Rentabilidad, en el panel.`
      );
    }
    if (rentabilidad.totales.sinEconomia > 0) {
      nota(
        doc,
        `${rentabilidad.totales.sinEconomia} ${rentabilidad.totales.sinEconomia === 1 ? "producto no tiene" : "productos no tienen"} precio, costo, flete o efectividad cargados, así que su utilidad no se calcula y NO está en estos totales.`
      );
    }
    if (rentabilidad.contraste.vecesAtribuido != null) {
      nota(
        doc,
        `Meta y TikTok se atribuyen ${rentabilidad.contraste.vecesAtribuido.toFixed(1)} veces las órdenes que de verdad entraron por Shopify en este período (${rentabilidad.contraste.ordenesShopify} órdenes, ${moneda(rentabilidad.contraste.facturadoShopify)}).`
      );
    }
  }

  pie(
    doc,
    `${org?.name ?? "Importadora Bella"} · ${cuando} · generado el ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })} · hora de Ecuador`
  );
  doc.end();
  return listo;
}
