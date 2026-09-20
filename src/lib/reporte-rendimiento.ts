import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { rendimientoDelEquipo, type RendimientoPersona } from "@/lib/contenido";
import { COLOR, encabezado, moneda, moneda2, nota, pie, recuadro, seccion, tarjetas } from "@/lib/pdf-dibujo";

// El rendimiento del equipo, en PDF.
//
// La pantalla ya mostraba quién entregó qué y cómo le fue. Lo que faltaba era
// poder sacarlo del navegador: Emilia lo usa en la reunión de quincena y en la
// evaluación de cada persona, y para eso hacía falta una hoja que se pueda
// mandar, imprimir o guardar junto al resto de los informes.
//
// Sale en la misma línea gráfica que el informe de período y el diario: tres
// PDF de la misma empresa que no se parecen entre sí obligan a aprender a
// leerlos tres veces.
//
// SIN EL PERMISO DE FINANZAS no se dibujan gasto ni CPA, igual que en la
// pantalla. La ruta además es solo de dirección.

const isoDia = (d: Date) => d.toISOString().slice(0, 10);

export function nombreDelRendimiento(desde: Date, hasta: Date) {
  return `rendimiento-${isoDia(desde)}_a_${isoDia(hasta)}.pdf`;
}

/** Una tabla simple, que es lo que pide una comparación entre personas. */
function tabla(
  doc: PDFKit.PDFDocument,
  columnas: { titulo: string; ancho: number; derecha?: boolean }[],
  filas: string[][],
) {
  const margen = 48;
  const alto = 18;

  const encabezadoTabla = () => {
    const y = doc.y;
    doc.rect(margen, y, doc.page.width - margen * 2, alto).fill(COLOR.fondo);
    let x = margen + 8;
    doc.fillColor(COLOR.suave).fontSize(7.5);
    for (const c of columnas) {
      doc.text(c.titulo.toUpperCase(), x, y + 6, { width: c.ancho - 8, align: c.derecha ? "right" : "left" });
      x += c.ancho;
    }
    doc.y = y + alto;
    doc.fillColor(COLOR.tinta).fontSize(9);
  };

  encabezadoTabla();
  for (const fila of filas) {
    // Una fila partida entre dos páginas no se puede leer: si no entra, se
    // pasa entera y se repite el encabezado.
    if (doc.y > doc.page.height - 90) {
      doc.addPage();
      encabezadoTabla();
    }
    const y = doc.y;
    let x = margen + 8;
    doc.fillColor(COLOR.tinta).fontSize(9);
    fila.forEach((celda, i) => {
      const c = columnas[i];
      doc.text(celda, x, y + 5, { width: c.ancho - 8, align: c.derecha ? "right" : "left", lineBreak: false });
      x += c.ancho;
    });
    doc
      .moveTo(margen, y + alto)
      .lineTo(doc.page.width - margen, y + alto)
      .lineWidth(0.5)
      .strokeColor(COLOR.borde)
      .stroke();
    doc.y = y + alto;
  }
  doc.y += 10;
  doc.fillColor(COLOR.tinta).fontSize(10);
}

/** Cómo viene una persona, en una línea que se pueda leer en voz alta. */
function lectura(p: RendimientoPersona, verCifras: boolean) {
  const partes: string[] = [];
  partes.push(
    p.tareas > 0
      ? `${p.tareas} tareas del día a día, ${p.tareasHechas} cerradas`
      : "sin tareas cargadas en el día a día",
  );
  if (p.tareasIncumplidas > 0) partes.push(`${p.tareasIncumplidas} sin cumplir`);
  if (p.creativos > 0) partes.push(`${p.creativos} creativos comprometidos`);
  if (p.piezasDelPeriodo > 0) partes.push(`${p.piezasDelPeriodo} piezas en Requerimientos`);
  if (p.sinClasificar > 0) partes.push(`${p.sinClasificar} sin clasificar`);
  if (p.lotes > 0) partes.push(`${p.lotes} lotes`);
  if (p.winners > 0) partes.push(`${p.winners} winners`);
  if (verCifras && p.cpaPromedio != null) partes.push(`CPA ${moneda2(p.cpaPromedio)}`);
  if (p.mejorProducto) partes.push(`mejor: ${p.mejorProducto}`);
  return partes.join(" · ");
}

export async function generarRendimientoPDF(
  organizationId: string,
  desde: Date,
  hasta: Date,
  verCifras: boolean,
): Promise<{ pdf: Buffer; nombre: string }> {
  const [org, equipo] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    rendimientoDelEquipo(organizationId, desde, hasta, verCifras),
  ]);

  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const listo = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const bonito = (d: Date) =>
    d.toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
  const cuando = `${bonito(desde)} — ${bonito(hasta)}`;

  encabezado(doc, org?.name ?? "Importadora Bella", `Rendimiento del equipo · ${cuando}`);

  const conTrabajo = equipo.filter((p) => p.tareas > 0 || p.piezasDelPeriodo > 0 || p.lotes > 0);
  const tareas = equipo.reduce((s, p) => s + p.tareas, 0);
  const hechas = equipo.reduce((s, p) => s + p.tareasHechas, 0);
  const incumplidas = equipo.reduce((s, p) => s + p.tareasIncumplidas, 0);
  const creativos = equipo.reduce((s, p) => s + p.creativos, 0);
  const piezas = equipo.reduce((s, p) => s + p.piezasDelPeriodo, 0);
  const sinClasificar = equipo.reduce((s, p) => s + p.sinClasificar, 0);

  tarjetas(doc, [
    { label: "Personas con trabajo", valor: String(conTrabajo.length), nota: `de ${equipo.length} en el equipo` },
    {
      label: "Tareas del día a día",
      valor: tareas.toLocaleString("es-EC"),
      nota: `${creativos.toLocaleString("es-EC")} creativos`,
    },
    {
      label: "Cerradas",
      valor: tareas > 0 ? `${Math.round((hechas / tareas) * 100)}%` : "—",
      tono: tareas === 0 ? "neutro" : hechas / tareas >= 0.8 ? "bien" : "mal",
      nota: `${hechas.toLocaleString("es-EC")} de ${tareas.toLocaleString("es-EC")}`,
    },
    {
      label: "Sin cumplir",
      valor: incumplidas.toLocaleString("es-EC"),
      tono: incumplidas > 0 ? "mal" : "bien",
      nota: "marcadas como no cumplidas",
    },
    {
      label: "Piezas cargadas",
      valor: piezas.toLocaleString("es-EC"),
      nota: sinClasificar > 0 ? `${sinClasificar} sin clasificar` : "de Requerimientos",
    },
  ]);

  seccion(doc, "Cada persona en el período");
  const columnas = verCifras
    ? [
        { titulo: "Integrante", ancho: 112 },
        { titulo: "Día a día", ancho: 52, derecha: true },
        { titulo: "Cerradas", ancho: 56, derecha: true },
        { titulo: "Creativos", ancho: 54, derecha: true },
        { titulo: "Piezas", ancho: 44, derecha: true },
        { titulo: "Lotes", ancho: 40, derecha: true },
        { titulo: "Gasto", ancho: 62, derecha: true },
        { titulo: "CPA", ancho: 59, derecha: true },
      ]
    : [
        { titulo: "Integrante", ancho: 149 },
        { titulo: "Día a día", ancho: 70, derecha: true },
        { titulo: "Cerradas", ancho: 70, derecha: true },
        { titulo: "Creativos", ancho: 70, derecha: true },
        { titulo: "Piezas", ancho: 60, derecha: true },
        { titulo: "Lotes", ancho: 60, derecha: true },
      ];

  // Ordenado por carga: la conversación de la reunión arranca por quien más
  // movió, no por quien va primero en el abecedario.
  const orden = [...equipo].sort(
    (a, b) => b.tareas - a.tareas || b.piezasDelPeriodo - a.piezasDelPeriodo || a.nombre.localeCompare(b.nombre),
  );

  tabla(
    doc,
    columnas,
    orden.map((p) => {
      const base = [
        p.nombre,
        String(p.tareas),
        p.tareas > 0 ? `${p.tareasHechas} (${Math.round((p.tareasHechas / p.tareas) * 100)}%)` : "—",
        String(p.creativos),
        String(p.piezasDelPeriodo),
        String(p.lotes),
      ];
      return verCifras
        ? [...base, p.gastoTotal != null ? moneda(p.gastoTotal) : "—", p.cpaPromedio != null ? moneda2(p.cpaPromedio) : "—"]
        : base;
    }),
  );

  nota(
    doc,
    "Día a día es lo que cada persona cargó en el tablero dentro del período; piezas es lo de Requerimientos. Gasto y CPA salen de las campañas enlazadas al lote de cada persona por la nomenclatura: una campaña sin nomenclatura no se le puede atribuir a nadie, así que ahí el número queda corto, no en cero por mal trabajo.",
  );

  seccion(doc, "Persona por persona");
  for (const p of orden) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    recuadro(
      doc,
      p.nombre,
      [
        lectura(p, verCifras),
        p.productosACargo.length > 0
          ? `Productos a cargo: ${p.productosACargo.join(", ")}`
          : "Sin productos asignados en Notion.",
        ...(p.peorProducto ? [`El que peor viene: ${p.peorProducto}.`] : []),
      ],
      p.tareasIncumplidas > 0 ? "mal" : p.sinClasificar > 0 || p.pendientes > 0 ? "neutro" : "bien",
    );
  }

  pie(
    doc,
    `${org?.name ?? "Importadora Bella"} · ${cuando} · generado el ${new Date().toLocaleString("es-EC", { timeZone: "America/Guayaquil" })} · hora de Ecuador`,
  );
  doc.end();

  return { pdf: await listo, nombre: nombreDelRendimiento(desde, hasta) };
}
