/**
 * Mejoras del 24 de noviembre, para Emilia: objetivo desde la Calculadora,
 * Jarvis que une y explica, y Meta que reporta de más (medido el 24-nov).
 * Audio y video transcritos en entregas/Transcripcion_Emilia_23_noviembre.txt.
 * Cifras medidas el 24-nov con la versión 17d7988.
 *
 * pdfkit escribe en WinAnsi: nada de signo menos matemático ni flechas.
 *
 *   npx tsx scripts/pdf-mejoras-24nov.ts
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
  info: "#2c5aa0",
  infoFondo: "#e8f0fb",
};

type Estado = "SOLUCIONADO" | "EXPLICADO" | "TU RESPUESTA" | "REVISAR EN META";
const ESTILO: Record<Estado, [string, string]> = {
  SOLUCIONADO: [COLOR.bien, COLOR.bienFondo],
  EXPLICADO: [COLOR.info, COLOR.infoFondo],
  "TU RESPUESTA": [COLOR.ojo, COLOR.ojoFondo],
  "REVISAR EN META": [COLOR.ojo, COLOR.ojoFondo],
};

type Punto = { titulo: string; dijo: string; pasaba: string; quedo: string; donde: string; estado: Estado };

const PUNTOS: Punto[] = [
  {
    titulo: "El objetivo ahora sale de la Calculadora",
    dijo: "Emilia (23-nov): «lo que es objetivo, ¿de dónde sale? De calculadora, ¿no?».",
    pasaba:
      "No siempre. Cuando un producto se creaba desde las campañas, la ficha quedaba con un objetivo provisional, y ese era el que se mostraba. Por ejemplo, Gotas de drenaje mostraba $2,67 de objetivo.",
    quedo:
      "El objetivo de Shopify vs Ads y de Riesgo es el CPA objetivo de la Calculadora: el del mes, si guardaste uno para ese mes, y si no, el histórico. Gotas de drenaje ahora muestra $7,11, el mismo de la Calculadora. El valor provisional ya no se muestra: si un producto todavía no está en la Calculadora, aparece sin objetivo hasta que se cargue.",
    donde: "Control publicitario > Shopify vs Ads, y Riesgo",
    estado: "SOLUCIONADO",
  },
  {
    titulo: "Unir nombres hablándole a Jarvis",
    dijo: "Emilia (23-nov): «un botón donde yo le hable a Jarvis y le diga: la cápsula de hongos es reishi, y él lo una».",
    pasaba: "Para unir un nombre de Shopify o una campaña con su producto había que entrar a la ficha o a la pantalla de enlaces.",
    quedo:
      "Ahora se le puede escribir a Jarvis, por ejemplo: «los pedidos de Tremella son de Cápsula hongos de nieve» o «la campaña VITAL DROP es Vitaldrops». Jarvis busca el producto, revisa que el nombre exista en los pedidos o en las campañas y te muestra qué va a cambiar: cuántos pedidos o qué campañas pasan al producto. No guarda nada hasta que le respondes con el código de 6 letras que te da; el código vale 30 minutos y solo para quien lo pidió. Si hay dos productos parecidos, te pregunta cuál es. Solo pueden unir las personas de dirección que ven las cifras.",
    donde: "Jarvis (el chat), escribiéndole",
    estado: "SOLUCIONADO",
  },
  {
    titulo: "Preguntarle a Jarvis por qué sale algo",
    dijo: "Emilia (23-nov): «¿por qué me está saliendo esto?».",
    pasaba: "Cuando un producto salía «sin Shopify» o con un CPA raro, había que pedirnos la revisión.",
    quedo:
      "Se le puede preguntar directo, por ejemplo: «¿por qué Gotas de drenaje sale sin Shopify?» o «¿qué falta por unir?». Jarvis revisa el producto en ese período (pedidos de Shopify, compras de Meta y TikTok, gasto, CPA real y objetivo, de dónde sale el objetivo, qué nombres y campañas tiene unidos) y te explica la causa. Si encuentra nombres o campañas parecidos que no están unidos, te los muestra y te ofrece unirlos.",
    donde: "Jarvis (el chat), escribiéndole",
    estado: "SOLUCIONADO",
  },
  {
    titulo: "Meta se está atribuyendo más compras que los pedidos reales",
    dijo: "Panel, 23-nov: «485 compras se atribuyen Meta y TikTok (+197 contra 288 pedidos reales)».",
    pasaba:
      "Hasta el 13 de noviembre, Meta y TikTok juntos reportaban entre 100 % y 120 % de los pedidos de la tienda, que es lo normal. Desde el 15 de noviembre la cifra sube, y desde el 19 está entre 150 % y 170 %. La diferencia la pone casi toda Meta: en productos que solo se pautan en Meta, donde no puede haber solapamiento con TikTok, Meta empezó a reportar hasta el doble de pedidos (tabla de abajo). TikTok no cambió. Revisamos Jarvis: no duplica filas ni suma compras; guarda la cifra tal como la entrega Meta.",
    quedo:
      "El panel ya lo avisa: cuando Meta sola se atribuye casi tantas compras como todos los pedidos, lo dice en el recuadro naranja. La causa está del lado de Meta. Lo más probable es que reciba la compra dos veces por pedido, por ejemplo una vez desde el formulario contra entrega y otra desde Shopify, sin que Meta las descarte como repetidas. Eso no se ve desde Jarvis: hay que revisarlo en el Administrador de eventos (pasos abajo). Mientras tanto, para decidir usa el CPA real de Control publicitario, que se calcula con los pedidos de la tienda; el CPA del administrador de anuncios está saliendo más bajo que el real.",
    donde: "Panel > Ventas reales contra lo que atribuye la pauta",
    estado: "REVISAR EN META",
  },
];

const PASOS_META = [
  "Pregúntale al equipo qué se cambió entre el 14 y el 19 de noviembre en la tienda o en Meta: una app nueva, el formulario contra entrega, el píxel, la API de conversiones o un dominio nuevo.",
  "En el Business Manager, abre el Administrador de eventos y entra al píxel de la tienda.",
  "Abre el evento Purchase y mira de dónde llega (navegador, servidor o los dos) y si Meta muestra eventos repetidos o un aviso de deduplicación.",
  "Revisa si la app del formulario contra entrega tiene el píxel de Meta configurado y además está activo el canal de Facebook e Instagram de Shopify: si los dos mandan Purchase sin el mismo identificador, cada pedido se cuenta dos veces.",
  "Cuando se corrija, el panel lo va a mostrar solo: Meta debería volver a quedar por debajo de los pedidos de la tienda.",
];

type Seguimiento = { fecha: string; pidio: string; quedo: string; estado: Estado };

const SEGUIMIENTO: Seguimiento[] = [
  {
    fecha: "23-nov",
    pidio: "«lo que es objetivo, ¿de dónde sale? De calculadora, ¿no?»",
    quedo: "Sí, ahora sale de la Calculadora (del mes o histórico). Gotas de drenaje: $7,11.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "23-nov",
    pidio: "«le diga: la cápsula de hongos es reishi, y él lo una»",
    quedo: "Jarvis une nombres y campañas desde el chat, con un código de confirmación.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "23-nov",
    pidio: "«¿por qué me está saliendo esto?»",
    quedo: "Jarvis revisa el producto y explica la causa cuando se le pregunta.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "24-nov",
    pidio: "La diferencia entre lo que atribuye la pauta y los pedidos reales.",
    quedo: "Medido: es Meta, desde el 15-nov. El panel lo avisa; falta revisar el evento Purchase en Meta.",
    estado: "REVISAR EN META",
  },
  {
    fecha: "23-nov",
    pidio: "URO Probiótico, Parches granos, Mantequilla Soft Serve, Dermaroller 540 y Farmstay.",
    quedo: "Sigue pendiente: confirmar si son productos nuevos. Ahora también puedes unirlos hablándole a Jarvis.",
    estado: "TU RESPUESTA",
  },
];
const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "entregas", "Jarvis_Mejoras_24_noviembre_Emilia.pdf");
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

function sello(estado: Estado, x: number, y: number, ancho = 92) {
  const [color, fondo] = ESTILO[estado];
  doc.roundedRect(x, y, ancho, 16, 8).fill(fondo);
  doc.fontSize(7.5).fillColor(color).text(estado, x, y + 4.8, { width: ancho, align: "center", lineBreak: false });
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
  alto += doc.fontSize(12).heightOfString(titulo, { width: anchoTexto - 112 });
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
  sello(p.estado, 48 + ANCHO - 104, y0 + 10);
  doc.fontSize(12).fillColor(COLOR.tinta).text(titulo, 62, y0 + 12, { width: anchoTexto - 112 });

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

function tabla(filas: string[][], anchos: number[], resaltar = 2, colorResalte: string = COLOR.bien) {
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
        .fillColor(i === 0 ? COLOR.suave : j === resaltar ? colorResalte : COLOR.tinta)
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

/** Una fila del seguimiento: fecha, lo que pidió (citado), cómo quedó y su estado. */
function seguimiento(s: Seguimiento) {
  const anchoTexto = ANCHO - 28 - 54 - 100;
  const xTexto = 48 + 14 + 54;
  const alto =
    20 +
    doc.fontSize(9).heightOfString(s.pidio, { width: anchoTexto }) +
    doc.fontSize(9.5).heightOfString(s.quedo, { width: anchoTexto }) +
    4;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();
  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).lineWidth(0.7).strokeColor(COLOR.borde).stroke();
  doc.fontSize(9).fillColor(COLOR.suave).text(s.fecha, 62, y0 + 10, { width: 50, lineBreak: false });
  doc.fontSize(9).fillColor(COLOR.dijo).text(s.pidio, xTexto, y0 + 10, { width: anchoTexto });
  doc.fontSize(9.5).fillColor(COLOR.tinta).text(s.quedo, xTexto, doc.y + 4, { width: anchoTexto });
  sello(s.estado, 48 + ANCHO - 104, y0 + 9);
  doc.y = y0 + alto + 6;
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
doc.fillColor("#ffffff").fontSize(23).text("Mejoras del 24 de noviembre", 48, 32, { width: ANCHO });
doc
  .fillColor("#cfe9df")
  .fontSize(11)
  .text("El objetivo desde la Calculadora, Jarvis que une nombres y explica, y por qué Meta reporta de más", 48, 64, {
    width: ANCHO,
  });
doc.y = 134;
doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text("Para Emilia Villegas · Importadora Bella · jarvisecom.com · 24 de noviembre de 2026", 48, doc.y, { width: ANCHO });
doc.moveDown(1);

recuadro(
  "En pocas palabras",
  "Lo que pediste el 23 de noviembre ya está en vivo: el objetivo sale de la Calculadora (Gotas de drenaje pasó de $2,67 a $7,11), y a Jarvis se le puede pedir que una un nombre con su producto o que explique por qué un producto sale como sale. " +
    "Además encontramos por qué la pauta se atribuye tantas compras de más desde mediados de noviembre: es Meta, que reporta más compras que los pedidos reales. Eso se corrige en Meta, no en Jarvis; abajo están los pasos.",
  COLOR.bienFondo,
  COLOR.bienFondo,
);

seccion("Lo que pediste y lo que encontramos", "En recuadro, tus palabras o lo que mostró el panel. Debajo, qué estaba pasando y cómo quedó.", 340);
PUNTOS.forEach((p, i) => punto(p, i + 1));

seccion(
  "Meta: pedidos reales contra compras que se atribuye",
  "Productos que solo se pautan en Meta. Cada celda: pedidos de Shopify / compras que se atribuye Meta, por semana.",
  240,
);
tabla(
  [
    ["Producto", "27 oct a 2 nov", "3 a 9 nov", "10 a 16 nov", "17 a 23 nov"],
    ["Arbutin", "480 / 457", "566 / 549", "366 / 343", "449 / 725"],
    ["Té Apple Rose & Lotus Leaf", "22 / 19", "23 / 29", "53 / 89", "103 / 263"],
    ["Té 18 Flavors", "20 / 20", "40 / 50", "63 / 110", "29 / 94"],
    ["Combo Celimax", "19 / 25", "23 / 24", "36 / 32", "46 / 88"],
    ["Kahi", "33 / 37", "22 / 22", "16 / 9", "31 / 82"],
  ],
  [ANCHO * 0.32, ANCHO * 0.17, ANCHO * 0.17, ANCHO * 0.17, ANCHO * 0.17],
  4,
  COLOR.ojo,
);
doc
  .fontSize(8.5)
  .fillColor(COLOR.suave)
  .text(
    "Hasta la primera semana de noviembre las dos cifras iban casi iguales. En la última semana Meta reporta entre 1,6 y 3 veces los pedidos. Todos los productos juntos: Meta y TikTok sumaban 100 % a 120 % de los pedidos hasta el 13 de noviembre, y 150 % a 170 % desde el 19.",
    48,
    doc.y,
    { width: ANCHO },
  );

seccion("Cómo revisar el evento de compra en Meta", undefined, 220);
pasos(PASOS_META);

seccion("Seguimiento", "Lo pedido el 23 de noviembre y lo que sigue abierto.", 260);
SEGUIMIENTO.forEach(seguimiento);

const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(`Importadora Bella · Jarvis · Mejoras del 24 de noviembre · ${i + 1} de ${paginas.count}`, 48, doc.page.height - 38, {
      width: ANCHO,
      align: "center",
      lineBreak: false,
    });
}

doc.end();
console.log("PDF escrito en", salida);
