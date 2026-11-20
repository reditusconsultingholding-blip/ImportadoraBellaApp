/**
 * Revisión del 20 de noviembre, para Emilia.
 *
 * Septiembre y octubre de Jarvis contra su tablero «Comercial vs Pauta», y la
 * Calculadora por mes que pidió en su video del 20-nov (transcrito en
 * entregas/Transcripcion_video_Emilia_20_noviembre.txt). Las cifras de Jarvis
 * se midieron el 20-nov con la versión 3ce0d62; las del tablero, en el tablero
 * ese mismo día.
 *
 * pdfkit escribe en WinAnsi: nada de signo menos matemático ni flechas.
 *
 *   npx tsx scripts/pdf-revision-20nov.ts
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const COLOR = {
  tinta: "#1a1a1a",
  suave: "#616161",
  borde: "#e1e3e5",
  fondo: "#f6f6f7",
  marcaFuerte: "#004c3f",
  bien: "#0f7a4f",
  bienFondo: "#e3f5eb",
  ojo: "#b26e00",
  ojoFondo: "#fff4e0",
  dijo: "#5a3e00",
  dijoFondo: "#fbf6ea",
};

type Punto = { titulo: string; dijo: string; pasaba: string; quedo: string; donde: string };

const PUNTOS: Punto[] = [
  {
    titulo: "La Calculadora, también por mes",
    dijo:
      "Emilia (video, 20-nov): «que me pueda mostrar lo histórico, que está bien… pero también me aparezca por meses… la devolución no siempre va a ser la misma en cada mes… si yo cambio aquí, que solamente sea el mes de noviembre, tanto en control publicitario como en calculadora».",
    pasaba:
      "La Calculadora guardaba un solo juego de números por producto (el histórico), y ese mismo juego valía para todos los meses.",
    quedo:
      "Arriba, debajo del producto, está «Números de»: Histórico o un mes. Con un mes elegido trae lo que pasó de verdad ese mes, la confirmación del comercial y el CPA real (gasto entre pedidos), y lo que cambies (confirmación, devolución, CPA, flete, precio, costo) se guarda solo para ese mes. El Control publicitario usa esos números en ese mes. Si después lo corriges en Economía por producto, vale lo último que se cargó, en cualquiera de las dos pantallas.",
    donde: "Calculadora de precios > Números de",
  },
  {
    titulo: "Testeos: septiembre salía en 0 y octubre en 2",
    dijo: "Revisión del 20-nov contra el tablero: el tablero tiene 22 testeos en septiembre y 11 en octubre.",
    pasaba:
      "En Jarvis un producto era testeo para siempre o nunca, según su etiqueta de hoy. Pero un testeo lo es en su mes: Cutting Mix fue prueba en septiembre y desde octubre se pauta normal. Además, la mayoría de las pruebas chicas no tenía ficha.",
    quedo:
      "Cada producto guarda los meses en que estuvo en prueba. Se crearon las fichas de las pruebas de septiembre y octubre de tu lista, con sus campañas y pedidos. Septiembre: 22 testeos, con 3 en «Sin pauta enlazada» (Body cierre viral, Medicube PDRN barra y Spray crep). Octubre: 11, igual que el tablero (5 alto, 4 medio, 2 bajo).",
    donde: "Control publicitario > Testeos (elige el mes arriba)",
  },
  {
    titulo: "$5.088 de pauta de septiembre y octubre no tenía producto",
    dijo: "Revisión del 20-nov: en el tablero Pulsera de cobre de octubre tiene $4.674 de gasto; en Jarvis salía $4.341.",
    pasaba:
      "Campañas cuyo nombre no lleva el código del producto: su gasto quedaba en «sin producto» y el CPA de esos productos salía más bajo de lo real.",
    quedo:
      "Enlazadas: Pulsera de cobre en TikTok ($333 en octubre: pasa a riesgo alto con CPA $8,54, como el tablero), Gotas Berberina «BERBETIN» ($733 en septiembre), Mini UPS ($300 en octubre: $833, igual al tablero), Valdora Grill, Almohada Vital Rest, Pack antiácaros y las campañas de todas las pruebas chicas. Lo que sigue sin producto es búsqueda de personal y pruebas que no están en tu lista.",
    donde: "Control publicitario > Riesgo por producto",
  },
  {
    titulo: "Nombres en la ficha equivocada",
    dijo: "Revisión del 20-nov: Body de septiembre está en alto en el tablero (64,53 %) y en medio en Jarvis; Sungboon Glow y Beltrox no aparecían igual.",
    pasaba:
      "«BODY CIERRE VIRAL» (7 pedidos) se sumaba al Body compresor; «SUNGBOON EDITOR Glow PDRN Ampolla» estaba enlazado a Deep Collagen Pink, que es otro producto; y Beltrox estaba partido: las campañas en una ficha y los pedidos en otra.",
    quedo:
      "Body cierre viral es su propio testeo de septiembre y Body queda en 327 pedidos y 64,53 %, en alto como el tablero. Sungboon Glow tiene su ficha (54 pedidos y $498 en septiembre). Beltrox quedó en una sola ficha, con los pedidos de «Holden Belt», que es el mismo cinturón: 8 pedidos en septiembre y 42 en octubre. También se enlazaron los nombres de Shopify con «- Product Id:», que dejaban fuera 7 pedidos de Microclean.",
    donde: "Control publicitario > Riesgo por producto y Enlazar pedidos",
  },
  {
    titulo: "Octubre: 11.953 pedidos en el tablero y 11.949 en Jarvis",
    dijo: "Revisión del 20-nov: confirmación de octubre 72,09 % en el tablero y 72,31 % en Jarvis.",
    pasaba:
      "No es un error: el tablero es una foto de un momento y Jarvis lee la planilla del comercial en vivo. Entre una y otra, el comercial siguió confirmando pendientes y depurando pedidos de octubre.",
    quedo:
      "El gasto ($70.854), las compras de Meta + TikTok (12.671) y el CPA real ($5,93) son iguales. Septiembre coincide en todo: 13.230 pedidos, 72,57 %, $74.113 y CPA $5,60.",
    donde: "Control publicitario > Riesgo por producto",
  },
];

type Diferencia = { producto: string; tablero: string; jarvis: string; porque: string };

const DIFERENCIAS: Diferencia[] = [
  {
    producto: "Forthiq (septiembre)",
    tablero: "No aparece",
    jarvis: "Alto",
    porque: "$26 de pauta y ningún pedido. Jarvis lo deja en alto: es plata sin ventas que medir.",
  },
  {
    producto: "Kit loción de magnesio y Sungboon Deep Collagen (octubre)",
    tablero: "No aparecen",
    jarvis: "Alto",
    porque: "$13 y $15 de pauta sin pedidos. En noviembre el tablero sí los muestra en alto.",
  },
  {
    producto: "Melena de león (octubre)",
    tablero: "No aparece",
    jarvis: "Alto",
    porque: "Se enlazó «GOTERO MELENA DE LEON»: 2 pedidos con $77 de pauta (CPA $38,69).",
  },
  {
    producto: "Snowy (octubre)",
    tablero: "No aparece",
    jarvis: "Alto",
    porque: "1 pedido con $9 de pauta, de dos campañas del 31 de octubre.",
  },
  {
    producto: "Kit de batana (octubre)",
    tablero: "Alto (64,65 %)",
    jarvis: "Medio (65,29 %)",
    porque: "La planilla viva: el comercial confirmó 2 pedidos más desde la foto del tablero.",
  },
  {
    producto: "Numbuzin 9 NAD+ (testeo, septiembre)",
    tablero: "Medio (CPA $8,00)",
    jarvis: "Alto (CPA $8,02)",
    porque: "El tablero redondea el gasto a $32; con centavos es $32,08, y $8,02 pasa el tope de $8.",
  },
  {
    producto: "Crema anticaspa (noviembre)",
    tablero: "No aparece",
    jarvis: "Alto",
    porque: "11 pedidos, 63,64 % de confirmación y $12 de pauta del 1 al 19.",
  },
];

const PASOS = [
  "Entra a Calculadora de precios y elige el producto.",
  "En «Números de», elige el mes (por ejemplo, Solo noviembre 2026).",
  "Debajo aparecen los pedidos del comercial, la confirmación real y el CPA real de ese mes, y la Calculadora los toma como punto de partida.",
  "Cambia lo que haga falta (devolución, confirmación, CPA, flete…). Se guarda solo, y solo para ese mes: el histórico no se toca.",
  "Control publicitario usa esos números en ese mes, y en Economía por producto de ese mes aparecen los mismos.",
  "Para volver a los valores de siempre, elige «Histórico (todos los meses)».",
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "entregas", "Jarvis_Revision_20_noviembre_Emilia.pdf");
fs.mkdirSync(path.dirname(salida), { recursive: true });
doc.pipe(fs.createWriteStream(salida));

const ANCHO = doc.page.width - 96;

function seccion(texto: string, bajada?: string, espacio = 200) {
  if (doc.y > doc.page.height - espacio) doc.addPage();
  doc.moveDown(0.9);
  doc.fillColor(COLOR.tinta).fontSize(13.5).text(texto, 48, doc.y, { width: ANCHO });
  doc
    .moveTo(48, doc.y + 4)
    .lineTo(doc.page.width - 48, doc.y + 4)
    .lineWidth(0.5)
    .strokeColor(COLOR.borde)
    .stroke();
  doc.moveDown(0.7);
  if (bajada) {
    doc.fontSize(9.5).fillColor(COLOR.suave).text(bajada, 48, doc.y, { width: ANCHO });
    doc.moveDown(0.6);
  }
  doc.fillColor(COLOR.tinta).fontSize(10);
}

function recuadro(titulo: string, texto: string, fondo: string, borde: string) {
  const altoTexto = doc.fontSize(9.5).heightOfString(texto, { width: ANCHO - 32 });
  const alto = altoTexto + 44;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();
  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).fillAndStroke(fondo, borde);
  doc.fillColor(COLOR.tinta).fontSize(10.5).text(titulo, 64, y0 + 13, { width: ANCHO - 32 });
  doc.fillColor(COLOR.suave).fontSize(9.5).text(texto, 64, y0 + 29, { width: ANCHO - 32 });
  doc.y = y0 + alto + 12;
}

function punto(p: Punto, n: number) {
  const anchoTexto = ANCHO - 28;
  const bloques: [string, string, string][] = [
    ["QUÉ PASABA", p.pasaba, COLOR.tinta],
    ["CÓMO QUEDÓ", p.quedo, COLOR.tinta],
    ["DÓNDE ESTÁ", p.donde, COLOR.suave],
  ];
  const titulo = `${n}. ${p.titulo}`;
  let alto = 22;
  alto += doc.fontSize(12).heightOfString(titulo, { width: anchoTexto - 100 });
  const altoDijo = doc.fontSize(9).heightOfString(p.dijo, { width: anchoTexto - 20 }) + 14;
  alto += altoDijo + 10;
  for (const [etiqueta, cuerpo] of bloques) {
    alto += doc.fontSize(8).heightOfString(etiqueta, { width: anchoTexto }) + 7;
    alto += doc.fontSize(9.5).heightOfString(cuerpo, { width: anchoTexto }) + 1;
  }
  alto += 2;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).lineWidth(0.7).strokeColor(COLOR.borde).stroke();
  doc.roundedRect(48 + ANCHO - 92, y0 + 10, 80, 16, 8).fill(COLOR.bienFondo);
  doc.fontSize(8).fillColor(COLOR.bien).text("SOLUCIONADO", 48 + ANCHO - 92, y0 + 14.5, { width: 80, align: "center" });
  doc.fontSize(12).fillColor(COLOR.tinta).text(titulo, 62, y0 + 12, { width: anchoTexto - 100 });

  const yDijo = doc.y + 8;
  doc.roundedRect(62, yDijo, anchoTexto, altoDijo, 4).fill(COLOR.dijoFondo);
  doc.rect(62, yDijo, 3, altoDijo).fill(COLOR.ojo);
  doc.fontSize(9).fillColor(COLOR.dijo).text(p.dijo, 74, yDijo + 7, { width: anchoTexto - 20 });
  doc.y = yDijo + altoDijo + 2;

  for (const [etiqueta, cuerpo, color] of bloques) {
    doc.fontSize(8).fillColor(etiqueta === "CÓMO QUEDÓ" ? COLOR.bien : COLOR.suave).text(etiqueta, 62, doc.y + 7, { width: anchoTexto });
    doc.fontSize(9.5).fillColor(color).text(cuerpo, 62, doc.y + 1, { width: anchoTexto });
  }
  doc.y = y0 + alto + 10;
}

function tabla(filas: string[][], anchos: number[], resaltar = 2) {
  let y = doc.y;
  filas.forEach((fila, i) => {
    const alto = i === 0 ? 20 : 22;
    if (y + alto > doc.page.height - 70) {
      doc.addPage();
      y = doc.y;
    }
    if (i === 0) doc.rect(48, y, ANCHO, alto).fill(COLOR.fondo);
    let x = 48;
    fila.forEach((celda, j) => {
      doc
        .fillColor(i === 0 ? COLOR.suave : j === resaltar ? COLOR.bien : COLOR.tinta)
        .fontSize(i === 0 ? 8 : 9.5)
        .text(celda, x + 10, y + (i === 0 ? 6 : 6.5), {
          width: anchos[j] - 14,
          align: j === 0 ? "left" : "right",
          lineBreak: false,
        });
      x += anchos[j];
    });
    y += alto;
    doc.moveTo(48, y).lineTo(doc.page.width - 48, y).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
  });
  doc.y = y + 10;
}

/** Una diferencia que queda: producto, tablero, Jarvis y por qué, en una tarjeta. */
function diferencia(d: Diferencia) {
  const anchoTexto = ANCHO - 28;
  const lado = `Tablero: ${d.tablero}   ·   Jarvis: ${d.jarvis}`;
  const alto =
    24 +
    doc.fontSize(10.5).heightOfString(d.producto, { width: anchoTexto }) +
    doc.fontSize(9).heightOfString(lado, { width: anchoTexto }) +
    doc.fontSize(9.5).heightOfString(d.porque, { width: anchoTexto }) +
    6;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();
  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).fillAndStroke(COLOR.ojoFondo, COLOR.ojoFondo);
  doc.fillColor(COLOR.tinta).fontSize(10.5).text(d.producto, 62, y0 + 10, { width: anchoTexto });
  doc.fillColor(COLOR.ojo).fontSize(9).text(lado, 62, doc.y + 3, { width: anchoTexto });
  doc.fillColor(COLOR.suave).fontSize(9.5).text(d.porque, 62, doc.y + 3, { width: anchoTexto });
  doc.y = y0 + alto + 8;
}

function pasos(lista: string[]) {
  lista.forEach((p, i) => {
    const alto = doc.fontSize(9.5).heightOfString(p, { width: ANCHO - 34 }) + 8;
    if (doc.y + alto > doc.page.height - 70) doc.addPage();
    const y0 = doc.y;
    doc.circle(57, y0 + 6, 8).fill(COLOR.bienFondo);
    doc.fillColor(COLOR.bien).fontSize(8.5).text(String(i + 1), 49, y0 + 2.5, { width: 16, align: "center" });
    doc.fillColor(COLOR.tinta).fontSize(9.5).text(p, 74, y0, { width: ANCHO - 34 });
    doc.y = y0 + alto;
  });
}

/* ------------------------------- Portada -------------------------------- */
doc.rect(0, 0, doc.page.width, 110).fill(COLOR.marcaFuerte);
doc.fillColor("#ffffff").fontSize(23).text("Septiembre y octubre, y la Calculadora por mes", 48, 32, { width: ANCHO });
doc
  .fillColor("#cfe9df")
  .fontSize(11)
  .text("Jarvis contra tu tablero «Comercial vs Pauta», y lo que pediste en tu video del 20 de noviembre", 48, 64, {
    width: ANCHO,
  });
doc.y = 134;
doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text("Para Emilia Villegas · Importadora Bella · jarvisecom.com · 20 de noviembre de 2026", 48, doc.y, { width: ANCHO });
doc.moveDown(1);

recuadro(
  "En pocas palabras",
  "Septiembre y octubre ya cuadran con tu tablero: los mismos totales, los mismos testeos y los mismos productos en cada sección, salvo siete casos chicos que se explican uno por uno al final. " +
    "La Calculadora ahora se puede ver por mes: trae la confirmación y el CPA reales del mes que elijas, y lo que cambies ahí vale solo para ese mes, también en Control publicitario.",
  COLOR.bienFondo,
  COLOR.bienFondo,
);

seccion("Septiembre: tu tablero contra Jarvis", "Del 1 al 30 de septiembre. Medido el 20 de noviembre.");
tabla(
  [
    ["", "Tablero de Emilia", "Jarvis"],
    ["Pedidos del área comercial", "13.230", "13.230"],
    ["Confirmación", "72,57 %", "72,57 %"],
    ["Compras Meta + TikTok", "13.553", "13.553"],
    ["Gasto Meta + TikTok (sin WhatsApp)", "$74.113", "$74.113"],
    ["CPA real", "$5,60", "$5,60"],
    ["Riesgo alto / medio / bajo", "20 / 21 / 3", "21 / 21 / 3"],
    ["Testeos (con los «sin pauta»)", "22", "22"],
  ],
  [ANCHO * 0.46, ANCHO * 0.27, ANCHO * 0.27],
);
doc
  .fontSize(8.5)
  .fillColor(COLOR.suave)
  .text("El riesgo alto tiene uno más en Jarvis: Forthiq, con $26 de pauta y ningún pedido (ver el final).", 48, doc.y, {
    width: ANCHO,
  });

seccion("Octubre: tu tablero contra Jarvis", "Del 1 al 31 de octubre. Medido el 20 de noviembre.");
tabla(
  [
    ["", "Tablero de Emilia", "Jarvis"],
    ["Pedidos del área comercial", "11.953", "11.949"],
    ["Confirmación", "72,09 %", "72,31 %"],
    ["Compras Meta + TikTok", "12.671", "12.671"],
    ["Gasto Meta + TikTok (sin WhatsApp)", "$70.854", "$70.854"],
    ["CPA real", "$5,93", "$5,93"],
    ["Riesgo alto / medio / bajo", "18 / 20 / 2", "21 / 21 / 2"],
    ["Testeos alto / medio / bajo", "5 / 4 / 2", "5 / 4 / 2"],
  ],
  [ANCHO * 0.46, ANCHO * 0.27, ANCHO * 0.27],
);
doc
  .fontSize(8.5)
  .fillColor(COLOR.suave)
  .text(
    "Pedidos y confirmación cambian porque Jarvis lee la planilla en vivo. En riesgo, Jarvis suma cuatro productos con muy poca pauta y casi sin pedidos, y Kit de batana pasa de alto a medio por la planilla en vivo (ver el final).",
    48,
    doc.y,
    { width: ANCHO },
  );

seccion(
  "Lo que se vio y lo que se solucionó",
  "En recuadro, lo que dijiste o lo que se encontró al comparar. Debajo, qué estaba pasando y cómo quedó.",
  340,
);
PUNTOS.forEach((p, i) => punto(p, i + 1));

seccion("Cómo usar la Calculadora por mes", undefined, 260);
pasos(PASOS);

seccion(
  "Lo que todavía se ve distinto, y por qué",
  "Son siete casos, todos con poca pauta o por la planilla en vivo. Si alguno debería ir distinto, dímelo y lo ajustamos.",
  260,
);
DIFERENCIAS.forEach(diferencia);

const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(`Importadora Bella · Jarvis · Revisión del 20 de noviembre · ${i + 1} de ${paginas.count}`, 48, doc.page.height - 38, {
      width: ANCHO,
      align: "center",
      lineBreak: false,
    });
}

doc.end();
console.log("PDF escrito en", salida);
