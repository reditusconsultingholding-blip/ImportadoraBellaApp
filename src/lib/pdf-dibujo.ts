// Piezas para dibujar el reporte en PDF.
//
// pdfkit solo sabe de líneas, rectángulos y texto: acá viven las formas que se
// arman con eso — tarjetas, torta, barras y semáforos. Están separadas del
// contenido del reporte a propósito, para que agregar una sección no obligue a
// volver a resolver cómo se dibuja un porcentaje.

/** La paleta de la marca, la misma que la app. */
export const COLOR = {
  tinta: "#1a1a1a",
  suave: "#616161",
  borde: "#e1e3e5",
  fondo: "#f6f6f7",
  marca: "#008060",
  marcaFuerte: "#004c3f",
  bien: "#0f7a4f",
  bienFondo: "#e3f5eb",
  mal: "#b42318",
  malFondo: "#fdecea",
  ojo: "#b26e00",
  serie: ["#008060", "#4338ca", "#c2410c", "#ca8a04", "#0891b2", "#9333ea"],
};

type Doc = PDFKit.PDFDocument;

/** Una banda de color con el título del reporte. */
export function encabezado(doc: Doc, titulo: string, subtitulo: string) {
  const ancho = doc.page.width;
  doc.rect(0, 0, ancho, 96).fill(COLOR.marcaFuerte);
  doc.fillColor("#ffffff").fontSize(22).text(titulo, 48, 30, { width: ancho - 96 });
  doc.fillColor("#cfe9df").fontSize(11).text(subtitulo, 48, 60, { width: ancho - 96 });
  doc.fillColor(COLOR.tinta);
  doc.y = 128;
}

/** Título de sección, con una línea debajo que la separa de la anterior. */
export function seccion(doc: Doc, texto: string) {
  if (doc.y > doc.page.height - 160) doc.addPage();
  doc.moveDown(0.8);
  const y = doc.y;
  doc.fillColor(COLOR.tinta).fontSize(13).text(texto, 48, y);
  doc
    .moveTo(48, doc.y + 4)
    .lineTo(doc.page.width - 48, doc.y + 4)
    .lineWidth(0.5)
    .strokeColor(COLOR.borde)
    .stroke();
  doc.moveDown(0.8);
  doc.fillColor(COLOR.tinta).fontSize(10);
}

/**
 * Una fila de tarjetas con los números grandes.
 *
 * Se dibujan todas del mismo alto aunque una tenga nota y otra no: alturas
 * distintas en la misma fila se leen como si midieran cosas distintas.
 */
export function tarjetas(
  doc: Doc,
  items: { label: string; valor: string; nota?: string; tono?: "bien" | "mal" | "neutro" }[]
) {
  const margen = 48;
  const ancho = doc.page.width - margen * 2;
  const sep = 10;
  const w = (ancho - sep * (items.length - 1)) / items.length;
  const h = 62;
  const y = doc.y;

  items.forEach((item, i) => {
    const x = margen + i * (w + sep);
    doc.roundedRect(x, y, w, h, 5).fillAndStroke(COLOR.fondo, COLOR.borde);

    doc
      .fillColor(COLOR.suave)
      .fontSize(7)
      .text(item.label.toUpperCase(), x + 10, y + 10, { width: w - 20, characterSpacing: 0.6 });

    const color =
      item.tono === "bien" ? COLOR.bien : item.tono === "mal" ? COLOR.mal : COLOR.tinta;
    doc.fillColor(color).fontSize(15).text(item.valor, x + 10, y + 24, { width: w - 20 });

    if (item.nota) {
      doc
        .fillColor(COLOR.suave)
        .fontSize(7.5)
        .text(item.nota, x + 10, y + 45, { width: w - 20 });
    }
  });

  doc.y = y + h + 14;
  doc.fillColor(COLOR.tinta).fontSize(10);
}

/**
 * Torta de anillo con su leyenda al costado.
 *
 * Los segmentos se dibujan como sectores con el centro recortado. Una porción
 * por debajo del 2% se dibuja igual: sacarla haría que los porcentajes no
 * sumaran cien y eso siempre genera una pregunta.
 */
export function torta(
  doc: Doc,
  datos: { label: string; valor: number }[],
  opciones: { titulo?: string; radio?: number } = {}
) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  if (total <= 0 || datos.length === 0) return;

  const radio = opciones.radio ?? 62;
  const grosor = 26;
  const cx = 48 + radio;
  const cy = doc.y + radio + 6;

  let angulo = -Math.PI / 2;
  datos.forEach((d, i) => {
    const porcion = (d.valor / total) * Math.PI * 2;
    const color = COLOR.serie[i % COLOR.serie.length];

    // El sector se aproxima con segmentos rectos: pdfkit no tiene arcos, y a
    // un grado por paso la curva ya no se distingue de una de verdad.
    const pasos = Math.max(2, Math.ceil((porcion * 180) / Math.PI));
    const punto = (a: number, r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;

    const [x0, y0] = punto(angulo, radio);
    doc.moveTo(x0, y0);
    for (let p = 1; p <= pasos; p++) {
      const [x, y] = punto(angulo + (porcion * p) / pasos, radio);
      doc.lineTo(x, y);
    }
    for (let p = pasos; p >= 0; p--) {
      const [x, y] = punto(angulo + (porcion * p) / pasos, radio - grosor);
      doc.lineTo(x, y);
    }
    doc.closePath().fill(color);

    angulo += porcion;
  });
  // La leyenda, al costado y con el ancho que le sobra a la página: al lado de
  // la torta, un nombre largo como "Releasit COD Form" se corta.
  const lx = 48 + radio * 2 + 26;
  let ly = doc.y + 10;
  datos.forEach((d, i) => {
    const color = COLOR.serie[i % COLOR.serie.length];
    doc.circle(lx + 4, ly + 4, 4).fill(color);
    doc
      .fillColor(COLOR.tinta)
      .fontSize(9)
      .text(d.label, lx + 14, ly, { width: 170, ellipsis: true });
    doc
      .fillColor(COLOR.suave)
      .fontSize(9)
      .text(
        `${moneda(d.valor)}  ·  ${Math.round((d.valor / total) * 100)}%`,
        lx + 14,
        ly + 11,
        { width: 200 }
      );
    ly += 28;
  });

  doc.y = Math.max(cy + radio + 12, ly + 4);
  doc.fillColor(COLOR.tinta).fontSize(10);
}

/** Barras horizontales: sirven para rankings, que es casi todo lo que se lista. */
export function barras(
  doc: Doc,
  datos: { label: string; valor: number; nota?: string }[],
  opciones: { max?: number; color?: string } = {}
) {
  if (datos.length === 0) return;
  const margen = 48;
  const anchoTotal = doc.page.width - margen * 2;
  const anchoEtiqueta = 150;
  const anchoBarra = anchoTotal - anchoEtiqueta - 92;
  const max = opciones.max ?? Math.max(...datos.map((d) => Math.abs(d.valor)), 1);

  for (const d of datos) {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const y = doc.y;

    doc
      .fillColor(COLOR.tinta)
      .fontSize(9)
      .text(d.label, margen, y, { width: anchoEtiqueta - 8, ellipsis: true });

    const w = Math.max(2, (Math.abs(d.valor) / max) * anchoBarra);
    const color = opciones.color ?? (d.valor < 0 ? COLOR.mal : COLOR.marca);
    doc.roundedRect(margen + anchoEtiqueta, y - 1, w, 11, 3).fill(color);

    doc
      .fillColor(COLOR.suave)
      .fontSize(9)
      .text(d.nota ?? moneda(d.valor), margen + anchoEtiqueta + anchoBarra + 8, y, {
        width: 84,
        align: "right",
      });

    doc.y = y + 18;
  }
  doc.fillColor(COLOR.tinta).fontSize(10);
}

/** Una lista con semáforo: punto de color, nombre y detalle. */
export function semaforo(
  doc: Doc,
  items: { texto: string; detalle?: string; tono: "bien" | "mal" | "ojo" | "neutro" }[]
) {
  const margen = 48;
  const ancho = doc.page.width - margen * 2;

  for (const it of items) {
    if (doc.y > doc.page.height - 80) doc.addPage();
    const y = doc.y;
    const color =
      it.tono === "bien"
        ? COLOR.bien
        : it.tono === "mal"
          ? COLOR.mal
          : it.tono === "ojo"
            ? COLOR.ojo
            : COLOR.suave;

    doc.circle(margen + 3, y + 5, 3).fill(color);
    doc
      .fillColor(COLOR.tinta)
      .fontSize(9.5)
      .text(it.texto, margen + 14, y, { width: ancho - 14 });

    if (it.detalle) {
      doc
        .fillColor(COLOR.suave)
        .fontSize(8.5)
        .text(it.detalle, margen + 14, doc.y, { width: ancho - 14 });
    }
    doc.y += 6;
  }
  doc.fillColor(COLOR.tinta).fontSize(10);
}

/**
 * Un recuadro para lo que hay que hacer, partido en las páginas que haga falta.
 *
 * Antes dibujaba un solo bloque del alto de todas las líneas juntas. Con la
 * lista recortada a cinco eso siempre entraba; desde que el reporte lleva TODAS
 * las recomendaciones, un recuadro puede medir más que la página y lo de abajo
 * terminaba encima del pie o directamente fuera del papel. Ahora se llena lo
 * que queda de página, se corta y sigue en la siguiente diciendo que continúa —
 * porque un recuadro cortado sin avisar se lee como si ahí terminara la lista.
 */
export function recuadro(
  doc: Doc,
  titulo: string,
  lineas: string[],
  tono: "bien" | "mal" | "neutro" = "neutro"
) {
  if (lineas.length === 0) return;

  const margen = 48;
  const ancho = doc.page.width - margen * 2;
  const anchoTexto = ancho - 32;

  const fondo = tono === "bien" ? COLOR.bienFondo : tono === "mal" ? COLOR.malFondo : COLOR.fondo;
  const borde = tono === "bien" ? COLOR.bien : tono === "mal" ? COLOR.mal : COLOR.borde;
  const colorTitulo = tono === "mal" ? COLOR.mal : tono === "bien" ? COLOR.bien : COLOR.tinta;

  // El alto del título dentro del recuadro y el aire que queda abajo.
  const ALTO_TITULO = 28;
  const AIRE = 8;
  // Hasta dónde se puede dibujar sin pisar el pie de página.
  const limite = () => doc.page.height - 56;
  const altoDe = (l: string) => doc.fontSize(9).heightOfString(`• ${l}`, { width: anchoTexto }) + 6;

  let i = 0;
  let primero = true;

  while (i < lineas.length) {
    // Un recuadro que arranca a treinta píxeles del pie no se lee: si no entra
    // ni el título con su primera línea, empieza en la página siguiente.
    if (doc.y + ALTO_TITULO + altoDe(lineas[i]) + AIRE > limite()) doc.addPage();

    const yInicio = doc.y;
    const disponible = limite() - yInicio;

    // Cuántas líneas entran en lo que queda. Siempre entra al menos una: sin
    // eso, una línea larguísima haría girar el bucle para siempre.
    const bloque: string[] = [];
    let alto = ALTO_TITULO;
    while (i < lineas.length) {
      const h = altoDe(lineas[i]);
      if (bloque.length > 0 && alto + h + AIRE > disponible) break;
      bloque.push(lineas[i]);
      alto += h;
      i++;
    }
    alto += AIRE;

    doc.roundedRect(margen, yInicio, ancho, alto, 5).fillAndStroke(fondo, borde);

    doc
      .fillColor(colorTitulo)
      .fontSize(10)
      .text(primero ? titulo : `${titulo} (continúa)`, margen + 16, yInicio + 12, {
        width: anchoTexto,
      });

    let y = yInicio + ALTO_TITULO;
    for (const l of bloque) {
      doc.fillColor(COLOR.tinta).fontSize(9).text(`• ${l}`, margen + 16, y, { width: anchoTexto });
      y = doc.y + 4;
    }

    doc.y = yInicio + alto + 12;
    primero = false;
  }

  doc.fillColor(COLOR.tinta).fontSize(10);
}

/**
 * Una línea chica al pie de una sección, para decir qué quedó afuera.
 *
 * Existe porque un ranking cortado en silencio se lee como "esto es todo": si
 * de treinta productos se muestran ocho, hay que decir que son ocho de treinta
 * y dónde están los otros.
 */
export function nota(doc: Doc, texto: string) {
  if (doc.y > doc.page.height - 80) doc.addPage();
  doc
    .fillColor(COLOR.suave)
    .fontSize(8)
    .text(texto, 48, doc.y + 2, { width: doc.page.width - 96 });
  doc.y += 6;
  doc.fillColor(COLOR.tinta).fontSize(10);
}

export function moneda(n: number) {
  return n.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function moneda2(n: number) {
  return n.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

/** El pie con la fecha de generación, en todas las páginas. */
export function pie(doc: Doc, texto: string) {
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor(COLOR.suave)
      .fontSize(7.5)
      .text(texto, 48, doc.page.height - 34, {
        width: doc.page.width - 96,
        align: "center",
        lineBreak: false,
      });
  }
}
