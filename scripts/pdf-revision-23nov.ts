/**
 * Revisión del 23 de noviembre, para Emilia: productos «sin Shopify» y el
 * seguimiento de todo lo que ha pedido desde el 17-nov, citándola.
 * Audio y video transcritos en entregas/Transcripcion_Emilia_23_noviembre.txt.
 * Cifras medidas el 23-nov con la versión 2e97e85.
 *
 * pdfkit escribe en WinAnsi: nada de signo menos matemático ni flechas.
 *
 *   npx tsx scripts/pdf-revision-23nov.ts
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

type Estado = "SOLUCIONADO" | "EXPLICADO" | "TU RESPUESTA";
const ESTILO: Record<Estado, [string, string]> = {
  SOLUCIONADO: [COLOR.bien, COLOR.bienFondo],
  EXPLICADO: [COLOR.info, COLOR.infoFondo],
  "TU RESPUESTA": [COLOR.ojo, COLOR.ojoFondo],
};

type Punto = { titulo: string; dijo: string; pasaba: string; quedo: string; donde: string; estado: Estado };

const PUNTOS: Punto[] = [
  {
    titulo: "Productos con compras en Meta y TikTok pero sin pedidos de Shopify",
    dijo:
      "Emilia (audio, 23-nov): «hay algunos productos que no me aparecen con el dato… no me aparece ni siquiera el dato de Shopify. Me aparece solamente lo de la plataforma… son testeos, son productos nuevos».",
    pasaba:
      "Cada oferta o testeo nuevo llega de Shopify con un título nuevo (por ejemplo «2 Shampoo + 1 Aceite de Batana» o «Tremella Hongo de la Belleza…»). Jarvis no sabía a qué producto pertenecía, así que esos pedidos no sumaban a ninguno: en noviembre eran 354.",
    quedo:
      "De 354 pedidos sin producto quedan 56. Ya suman en su producto: Combo batana, Vitaldrops, Gotas de drenaje (Mayaverra), Cutting Mix, Kit loción de magnesio y los desodorantes Truly. El Bloqueador Tocobo quedó marcado como upsell, que no es un producto aparte. Los 56 que quedan son de 5 productos que no tienen ficha (punto 5).",
    donde: "Control publicitario > Shopify vs Ads",
    estado: "SOLUCIONADO",
  },
  {
    titulo: "Que se sincronice solo cuando agregan productos",
    dijo:
      "Emilia (video, 23-nov): «debe haber alguna manera para sincronizar, ya que nosotros vamos agregando productos… esto de aquí lo tenemos que hacer urgente».",
    pasaba:
      "Cada nombre nuevo de Shopify y cada campaña de prueba sin código había que enlazarlos a mano.",
    quedo:
      "Ahora es automático en dos frentes. 1) Los títulos de Shopify que traen «- Product Id: …» se enlazan solos a su producto cada 15 minutos, justo después de cada sincronización con Shopify. 2) En la ficha de cada producto hay un recuadro nuevo, «Otros nombres en las campañas»: si una campaña de prueba se llama distinto al producto (ej.: «VITAL DROP»), se escribe ahí una vez y desde ese momento toda campaña con ese nombre cae sola en el producto, con tildes o sin ellas. Ya quedaron 13 campañas de noviembre enlazadas así: Vital Drop, Tremella, Kit Pilates y Pulsera Pixiu.",
    donde: "Productos > (ficha del producto) > Otros nombres en las campañas",
    estado: "SOLUCIONADO",
  },
  {
    titulo: "Tremella y Cápsula hongos de nieve son el mismo producto",
    dijo: "Emilia (mensaje, 23-nov): «Tremella y cápsula hongos es lo mismo».",
    pasaba:
      "Los pedidos de Shopify salían como «Tremella…» y las campañas como «TREMELLA», «TERMELLA» o «CAPSULA HONGOS DE NIEVE», repartidos o sin producto.",
    quedo:
      "Todo quedó en una sola ficha, Cápsula hongos de nieve: los dos títulos de Shopify de Tremella y las campañas con TREMELLA, TERMELLA (como está escrita en una campaña) y HONGOS DE NIEVE.",
    donde: "Productos > Cápsula hongos de nieve",
    estado: "SOLUCIONADO",
  },
  {
    titulo: "Crema anticaspa y Snowy del 22 de noviembre",
    dijo: "Emilia (video, 23-nov): «En Snow es asimismo, crema anticaspa… no me está poniendo aquí la cantidad de Shopify».",
    pasaba:
      "Se revisó pedido por pedido. Ese día no hubo pedidos de esos dos productos ni en Shopify ni en la planilla del comercial.",
    quedo:
      "Aquí el «sin Shopify» es real, no es un error: Meta y TikTok se atribuyeron el 22-nov compras de días anteriores (Crema anticaspa: 3 compras con $4 de pauta; Snowy: 1 compra con $0). Si se mira la semana completa, los pedidos sí aparecen.",
    donde: "Control publicitario > Shopify vs Ads (elige varios días)",
    estado: "EXPLICADO",
  },
  {
    titulo: "Cinco productos se venden y no tienen ficha en Jarvis",
    dijo: "Encontrado en la revisión del 23-nov: son los 56 pedidos de noviembre que todavía no suman a ningún producto.",
    pasaba:
      "Son productos que se están vendiendo en Shopify pero no existen en Jarvis, así que no hay a dónde enlazarlos sin saber si son nuevos.",
    quedo:
      "URO Probiótico Vaginal (32 pedidos), Parches removedor de granos (10), Mantequilla corporal Soft Serve (7), Dermaroller 540 (6) y Gel de colágeno Farmstay (1). Necesito que me confirmes si son productos nuevos para crearles su ficha, o si alguno va con un producto que ya existe. Apenas me digas, se enlazan.",
    donde: "Control publicitario > Enlazar pedidos",
    estado: "TU RESPUESTA",
  },
];

type Seguimiento = { fecha: string; pidio: string; quedo: string; estado: Estado };

const SEGUIMIENTO: Seguimiento[] = [
  {
    fecha: "17-nov",
    pidio: "«a mí me aparece que han habido seis mil cuatrocientos setenta y siete… acá aparece seis mil cuatrocientos cuarenta y cuatro pedidos»",
    quedo: "Pedidos y gasto iguales a tu tablero: 6.763 pedidos del comercial y $39.668 (1 al 17 de noviembre).",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "17-nov",
    pidio: "«yo tengo que hay diez productos que están en riesgo alto, hay diecinueve en riesgo medio y riesgo bajo uno. En cambio, acá no»",
    quedo:
      "Riesgo por producto con tus mismas reglas y los mismos productos que tu tablero. Cada producto dice su motivo y los umbrales se cambian en «Umbrales».",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "17-nov",
    pidio: "«NIDA sigue apareciendo trece con sesenta y nueve… el CPA es de seis con sesenta y cinco»",
    quedo: "A NIDA ya no le suman las campañas de WhatsApp: CPA $6,63, contra los pedidos del comercial.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "18-nov",
    pidio: "Testeos y botón para descartar, como en tu tablero.",
    quedo: "Sección Testeos con tu lista y botón «Descartar» en cada producto (se recupera con «Restaurar»).",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "20-nov",
    pidio: "«que también me aparezca por meses… si yo cambio aquí, que solamente sea el mes de noviembre, tanto en control publicitario como en calculadora»",
    quedo:
      "Calculadora por mes: en «Números de» eliges el mes, trae la confirmación y el CPA reales, y lo que cambies vale solo para ese mes, también en Control publicitario.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "20-nov",
    pidio: "Septiembre y octubre contra tu tablero «Comercial vs Pauta».",
    quedo:
      "Cuadrados: mismos totales, testeos por mes y $5.088 de pauta enlazada. Los siete casos chicos que se ven distinto quedaron explicados en el PDF del 20-nov.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "23-nov",
    pidio: "«no me aparece ni siquiera el dato de Shopify. Me aparece solamente lo de la plataforma»",
    quedo: "354 pedidos de noviembre enlazados a su producto; quedan 56 de 5 productos sin ficha.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "23-nov",
    pidio: "«debe haber alguna manera para sincronizar, ya que nosotros vamos agregando productos»",
    quedo: "Enlace automático cada 15 minutos y recuadro «Otros nombres en las campañas» en cada ficha.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "23-nov",
    pidio: "«Tremella y cápsula hongos es lo mismo»",
    quedo: "Unidos en Cápsula hongos de nieve, con sus pedidos y campañas.",
    estado: "SOLUCIONADO",
  },
  {
    fecha: "23-nov",
    pidio: "«En Snow es asimismo, crema anticaspa»",
    quedo: "Revisado: el 22-nov no hubo pedidos de esos productos; las plataformas atribuyeron compras de días anteriores.",
    estado: "EXPLICADO",
  },
  {
    fecha: "23-nov",
    pidio: "URO Probiótico, Parches granos, Mantequilla Soft Serve, Dermaroller 540 y Farmstay.",
    quedo: "Confirmar si son productos nuevos o van con uno que ya existe.",
    estado: "TU RESPUESTA",
  },
];

const PASOS = [
  "Entra a Productos y abre la ficha del producto (por ejemplo, Vitaldrops).",
  "Baja hasta «Otros nombres en las campañas».",
  "Escribe el nombre como aparece en la campaña (por ejemplo, VITAL DROP) y guárdalo.",
  "En ese momento Jarvis reasigna las campañas que llevan ese nombre, y el gasto aparece en el producto sin esperar la próxima sincronización.",
  "Usa nombres de 3 letras o más que no estén en otros productos: el nombre tiene que aparecer como palabra entera en la campaña.",
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "entregas", "Jarvis_Revision_23_noviembre_Emilia.pdf");
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
doc.fillColor("#ffffff").fontSize(23).text("Productos «sin Shopify» y seguimiento", 48, 32, { width: ANCHO });
doc
  .fillColor("#cfe9df")
  .fontSize(11)
  .text("Lo que pediste en tu audio y tu video del 23 de noviembre, y el estado de todo lo pedido desde el 17", 48, 64, {
    width: ANCHO,
  });
doc.y = 134;
doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text("Para Emilia Villegas · Importadora Bella · jarvisecom.com · 23 de noviembre de 2026", 48, doc.y, { width: ANCHO });
doc.moveDown(1);

recuadro(
  "En pocas palabras",
  "Los productos nuevos y los testeos ya suman sus pedidos de Shopify: de 354 pedidos de noviembre sin producto quedan 56, y 13 campañas de prueba ya caen en su producto. " +
    "Desde ahora se sincroniza solo: los nombres nuevos de Shopify se enlazan cada 15 minutos y cada ficha tiene un recuadro para los otros nombres de sus campañas. " +
    "Solo falta que me confirmes cinco productos que se venden y no tienen ficha.",
  COLOR.bienFondo,
  COLOR.bienFondo,
);

seccion("Noviembre: antes y después", "Del 1 al 23 de noviembre. Medido el 23 de noviembre.");
tabla(
  [
    ["", "Antes", "Ahora"],
    ["Pedidos de Shopify sin producto", "354", "56"],
    ["Campañas de prueba sin producto (enlazadas hoy)", "13", "0"],
    ["Productos con pedidos y sin ficha", "No se veía", "5"],
    ["Nombres nuevos de Shopify", "A mano", "Solos, cada 15 min"],
  ],
  [ANCHO * 0.52, ANCHO * 0.24, ANCHO * 0.24],
);
doc
  .fontSize(8.5)
  .fillColor(COLOR.suave)
  .text("Los 56 pedidos que quedan son de los cinco productos sin ficha del punto 5.", 48, doc.y, { width: ANCHO });

seccion(
  "Lo que pediste el 23 de noviembre",
  "En recuadro, tus palabras. Debajo, qué estaba pasando y cómo quedó.",
  340,
);
PUNTOS.forEach((p, i) => punto(p, i + 1));

seccion("Cómo agregar otro nombre de campaña", undefined, 220);
pasos(PASOS);

seccion(
  "Seguimiento de lo que has pedido",
  "Todo lo pedido desde tu video del 17 de noviembre, con tus palabras, y cómo quedó.",
  260,
);
SEGUIMIENTO.forEach(seguimiento);

const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(`Importadora Bella · Jarvis · Revisión del 23 de noviembre · ${i + 1} de ${paginas.count}`, 48, doc.page.height - 38, {
      width: ANCHO,
      align: "center",
      lineBreak: false,
    });
}

doc.end();
console.log("PDF escrito en", salida);
