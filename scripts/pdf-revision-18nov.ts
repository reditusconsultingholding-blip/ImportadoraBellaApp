/**
 * Revisión del 18 de noviembre, para Fabrizio.
 *
 * Pedido de Sebastian: «el mismo [mensaje de Emilia] para Fabricio pero en
 * PDF, con anotaciones de lo que dijeron y lo que se solucionó».
 *
 * Lo que dijeron sale del video de Emilia del 17-nov (transcrito en
 * entregas/Transcripcion_video_Emilia_17_noviembre.txt) y de sus mensajes del
 * 18-nov. Cada cifra de «cómo quedó» se midió en jarvisecom.com contra su
 * tablero «Comercial vs Pauta», del 1 al 17 de noviembre.
 *
 * pdfkit escribe en WinAnsi: nada de signo menos matemático ni flechas.
 *
 *   npx tsx scripts/pdf-revision-18nov.ts
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

const COLOR = {
  tinta: "#1a1a1a",
  suave: "#616161",
  borde: "#e1e3e5",
  fondo: "#f6f6f7",
  marca: "#008060",
  marcaFuerte: "#004c3f",
  bien: "#0f7a4f",
  bienFondo: "#e3f5eb",
  ojo: "#b26e00",
  ojoFondo: "#fff4e0",
  dijo: "#5a3e00",
  dijoFondo: "#fbf6ea",
};

type Punto = {
  titulo: string;
  /** Lo que dijeron, en sus palabras. */
  dijo: string;
  /** Qué estaba pasando. */
  pasaba: string;
  /** Cómo quedó, medido en vivo. */
  quedo: string;
  donde: string;
};

const PUNTOS: Punto[] = [
  {
    titulo: "NIDA salía con CPA de $13,69",
    dijo: "Emilia (video, 17-nov): «NIDA sigue apareciendo trece con sesenta y nueve cuando no es así… el CPA es de seis con sesenta y cinco».",
    pasaba:
      "A NIDA se le sumaban unos $1.560 de las campañas «NIDA/WP…» de la cuenta CP2 - Top Ventas, que vende por WhatsApp y no trae compras web. El tablero de Emilia no cuenta esa cuenta.",
    quedo:
      "CP2 - Top Ventas quedó marcada como cuenta que vende por WhatsApp y sale de la comparación, igual que en el tablero. NIDA: $1.464 de gasto, 221 pedidos del comercial, CPA real $6,63 (el tablero: $6,62).",
    donde: "Control publicitario > Riesgo por producto",
  },
  {
    titulo: "Pedidos, confirmación, compras de plataforma y gasto no coincidían",
    dijo: "Emilia (video): «en Shopify… seis mil cuatrocientos setenta y siete… acá aparece seis mil cuatrocientos cuarenta y cuatro» y «la confirmación… setenta con ochenta y tres por ciento, aquí setenta con cuarenta y siete».",
    pasaba:
      "Se comparaban cifras distintas: los pedidos de Shopify contra los que registra el área comercial, y una confirmación tomada a distinta hora. Además, el gasto y las compras de WhatsApp y de las campañas sin producto entraban distinto.",
    quedo:
      "Del 1 al 17 de noviembre: Shopify 6.787 y gasto $39.670 en los dos; compras de Meta + TikTok 8.102 en los dos. Pedidos del comercial: 6.763 en el tablero y 6.762 en Jarvis. La confirmación queda en 70,43 % (tablero) y 70,54 % (Jarvis): Jarvis lee la planilla en vivo y el comercial sigue confirmando pendientes, por eso sube unas décimas durante el día.",
    donde: "Riesgo por producto (pedidos del comercial) y Shopify vs Ads (pedidos de Shopify)",
  },
  {
    titulo: "Las secciones de riesgo no daban lo mismo",
    dijo: "Emilia (video): «tengo que hay diez productos que están en riesgo alto, hay diecinueve en riesgo medio y riesgo bajo uno. En cambio, acá no».",
    pasaba:
      "Jarvis usaba la regla del 16-nov (70 % / 57 % y CPA rojo sobre $6). Emilia cambió la regla en su tablero: alto si confirma menos de 65 % o el CPA real pasa de $8; medio si no llega a 70 %, el CPA pasa de $5, tiene menos de 30 pedidos o la plataforma cuenta más de 1,33 veces los pedidos de Shopify.",
    quedo:
      "Jarvis usa la regla nueva, con los mismos productos en cada sección: 17 alto, 12 medio, 2 bajo (el tablero de hoy: 17, 12 y 2). Alto se separa por causa (mala confirmación, CPA alto, o las dos), cada producto dice el motivo y los umbrales se mueven en la misma pantalla. Las gotas de drenaje (CPA $5,12) quedan en medio, como ella lo marcó.",
    donde: "Control publicitario > Riesgo por producto",
  },
  {
    titulo: "Testeos: 14 en el tablero, 12 en Jarvis, y la pestaña vacía",
    dijo: "Emilia (mensaje, 18-nov): «cuenta con 14 testeos… en Jarvis aparecen 12… si me pongo en la pestaña testeos no aparecen».",
    pasaba:
      "Faltaban las fichas de los testeos nuevos de noviembre y varias campañas de prueba no llevan el código en el nombre, así que su gasto quedaba sin producto. La pestaña Testeos mostraba otra cosa: los pedidos marcados uno por uno.",
    quedo:
      "Los 16 testeos del tablero, con las mismas cifras: 13 alto, 2 medio, 1 bajo (VEV y Yesnap en medio, Fundas en bajo). Se crearon Cereza ácida, TRM, PIL, Cápsula hongos de nieve y Gimnasio en barra; Vitaldrops pasó a testeo; el Power Bank 10000 va con el cargador RORRY; y se asignaron las campañas de Uric, Fundas, Medicube NAD, Baïa y Fwee. Neurobion B12 está en Descartados, como lo tiene Emilia. La pestaña muestra cada testeo con gasto, pedidos, CPA, confirmación y motivo.",
    donde: "Control publicitario > Testeos",
  },
  {
    titulo: "¿Dónde se ven pedidos, CPA y confirmación por producto?",
    dijo: "Emilia (video): «el tema de los pedidos, el CPA, la confirmación… ¿dónde yo lo veo aquí?… no encuentro esa parte».",
    pasaba: "Estaba repartido entre Economía por producto y Rentabilidad, que muestran otras cosas.",
    quedo:
      "Todo junto en Riesgo por producto: gasto, pedidos del comercial, compras de plataforma (Meta y TikTok por separado), CPA real, confirmación y utilidad, con un buscador por nombre o SKU. Los testeos, igual, en su pestaña.",
    donde: "Control publicitario > Riesgo por producto y Testeos",
  },
  {
    titulo: "Productos partidos en dos fichas o sin campañas",
    dijo: "Revisión del 18-nov, producto por producto contra el tablero.",
    pasaba:
      "Mini UPS tenía el gasto en una ficha y los 11 pedidos en otra; Snowy y SNOWYBRA estaban separados; el combo de shampoo + aceite de batana caía en Shampoo; las campañas de TikTok «PULSERACOBRE» y el «Kit de Barra de Pilates con Bandas» no estaban enlazados.",
    quedo:
      "Fichas unidas (Mini UPS, Snowy), combo en Combo Batana ($955), Pulsera de cobre con sus campañas de TikTok ($1.294, 223 compras), kit de Pilates enlazado a PIL. Las campañas nuevas de Mini UPS y Snowy caen solas en su ficha. Quedan sin producto, igual que en el tablero, $124 y 11 compras: búsqueda de personal y dos pruebas sin producto.",
    donde: "Control publicitario > Enlazar pedidos y Gestión de campañas",
  },
  {
    titulo: "Descartar un producto, como en el tablero",
    dijo: "El tablero de Emilia tiene un botón «Descartar» en cada producto.",
    pasaba: "Jarvis no lo tenía.",
    quedo:
      "Cada producto tiene «Descartar»: sale de las secciones y queda en la lista «Descartados», de donde vuelve con «Restaurar». Se guarda para todos, no solo en un navegador.",
    donde: "Riesgo por producto y Testeos",
  },
];

type Pendiente = { que: string; porque: string; quien: string };

const PENDIENTES: Pendiente[] = [
  {
    que: "Pegar el token de Meta en Conexiones > Meta",
    porque:
      "La lectura directa de Meta sigue sin token y Windsor falla de a ratos con Meta. Hoy el gasto de Meta entra completo por Windsor, pero si Windsor se cae otra vez el CPA sale más bajo de lo real. Pasos: en el Business Manager, crear un usuario del sistema con todas las cuentas publicitarias, generar el token con permiso ads_read y vencimiento Nunca, y pegarlo en Jarvis.",
    quien: "Fabrizio",
  },
  {
    que: "Acceso de Emilia",
    porque:
      "Emilia no pudo entrar: su usuario está bien (emilia.villegas@bellacorp.store), pero el correo de recuperación está apagado por decisión. Se le pone una contraseña temporal desde Usuarios y Jarvis le pide cambiarla al entrar.",
    quien: "Reditus",
  },
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "entregas", "Jarvis_Revision_18_noviembre.pdf");
fs.mkdirSync(path.dirname(salida), { recursive: true });
doc.pipe(fs.createWriteStream(salida));

const ANCHO = doc.page.width - 96;

/** `espacio`: lo mínimo que tiene que quedar en la página para no dejar el título solo. */
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

/** Un punto: lo que dijeron (en su recuadro), qué pasaba, cómo quedó y dónde. */
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

  // Lo que dijeron, en su propio recuadro.
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

function pendiente(p: Pendiente, n: number) {
  const anchoTexto = ANCHO - 28;
  const alto =
    30 +
    doc.fontSize(10.5).heightOfString(`${n}. ${p.que}`, { width: anchoTexto }) +
    doc.fontSize(9.5).heightOfString(p.porque, { width: anchoTexto }) +
    12;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();
  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).fillAndStroke(COLOR.ojoFondo, COLOR.ojoFondo);
  doc.fillColor(COLOR.tinta).fontSize(10.5).text(`${n}. ${p.que}`, 62, y0 + 12, { width: anchoTexto });
  doc.fillColor(COLOR.suave).fontSize(9.5).text(p.porque, 62, doc.y + 3, { width: anchoTexto });
  doc.fillColor(COLOR.ojo).fontSize(8.5).text(`Lo hace: ${p.quien}`, 62, doc.y + 3, { width: anchoTexto });
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

/* ------------------------------- Portada -------------------------------- */
doc.rect(0, 0, doc.page.width, 110).fill(COLOR.marcaFuerte);
doc.fillColor("#ffffff").fontSize(23).text("Revisión de Emilia: lo que se corrigió", 48, 32, { width: ANCHO });
doc
  .fillColor("#cfe9df")
  .fontSize(11)
  .text("Lo que dijo en su video del 17 de noviembre y en sus mensajes del 18, y cómo quedó en Jarvis", 48, 64, {
    width: ANCHO,
  });
doc.y = 134;
doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text("Importadora Bella · jarvisecom.com · 18 de noviembre de 2026", 48, doc.y, { width: ANCHO });
doc.moveDown(1);

recuadro(
  "En pocas palabras",
  "Jarvis quedó igual al tablero «Comercial vs Pauta» de Emilia, producto por producto, del 1 al 17 de noviembre: las mismas reglas de riesgo, los mismos productos en cada sección, los 16 testeos y el mismo gasto. " +
    "NIDA ya no suma las campañas de WhatsApp (CPA $6,63). " +
    "Lo urgente del lado del equipo sigue siendo el token de Meta.",
  COLOR.bienFondo,
  COLOR.bienFondo,
);

seccion(
  "El tablero de Emilia contra Jarvis",
  "Mismo período: del 1 al 17 de noviembre. Medido el 18 de noviembre en jarvisecom.com y en el tablero.",
);
tabla(
  [
    ["", "Tablero de Emilia", "Jarvis"],
    ["Pedidos de Shopify", "6.787", "6.787"],
    ["Pedidos del área comercial", "6.763", "6.762"],
    ["Confirmación", "70,43 %", "70,54 %"],
    ["Compras Meta + TikTok", "8.102", "8.102"],
    ["Gasto Meta + TikTok (sin WhatsApp)", "$39.670", "$39.670"],
    ["CPA real", "$5,87", "$5,87"],
    ["Riesgo alto / medio / bajo", "17 / 12 / 2", "17 / 12 / 2"],
    ["Testeos alto / medio / bajo", "13 / 2 / 1", "13 / 2 / 1"],
    ["CPA de NIDA", "$6,62", "$6,63"],
  ],
  [ANCHO * 0.46, ANCHO * 0.27, ANCHO * 0.27],
);
doc
  .fontSize(8.5)
  .fillColor(COLOR.suave)
  .text(
    "La diferencia de un pedido y de la confirmación es la hora del corte: el tablero es una foto de la mañana y Jarvis lee la planilla en vivo, mientras el comercial sigue confirmando los pendientes de los últimos días.",
    48,
    doc.y,
    { width: ANCHO },
  );

seccion(
  "Lo que dijeron y lo que se solucionó",
  "En recuadro, lo que dijo Emilia con sus palabras. Debajo, qué estaba pasando y cómo quedó.",
  340,
);
PUNTOS.forEach((p, i) => punto(p, i + 1));

seccion("Lo que queda del lado del equipo");
PENDIENTES.forEach((p, i) => pendiente(p, i + 1));

const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(`Importadora Bella · Jarvis · Revisión del 18 de noviembre · ${i + 1} de ${paginas.count}`, 48, doc.page.height - 38, {
      width: ANCHO,
      align: "center",
      lineBreak: false,
    });
}

doc.end();
console.log("PDF escrito en", salida);
