/**
 * Estado de alcance al 16 de noviembre, para Fabrizio y Emilia.
 *
 * Pedido de Sebastian: «mándame un mensaje + estado de alcance y demás en
 * PDF, y mensaje para que ellos revisen, y el link para capacitación de
 * Emilia con estos ajustes».
 *
 * Misma regla que el informe de octubre: cada cifra se midió en la app en
 * vivo, y lo que depende del equipo va aparte y con nombre.
 *
 * pdfkit escribe en WinAnsi: nada de signo menos matemático ni flechas.
 *
 *   npx tsx scripts/pdf-estado-alcance-16nov.ts
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
};

const LINK_CAPACITACION = "https://jarvisecom.com/dashboard?capacitacion=control-shopify-ads";

type Entrega = {
  titulo: string;
  /** Lo que pidieron, en sus palabras. */
  pedido?: string;
  hecho: string;
  donde: string;
};

/* ------------------------- 1. Los dos archivos --------------------------- */

const ARCHIVOS: Entrega[] = [
  {
    titulo: "El archivo de Fabrizio: Shopify contra Meta y TikTok",
    pedido:
      "Fabrizio, 10-nov: «¿cuántos pedidos me recibo diariamente en Shopify? ¿Cuántos recibo en las plataformas y la diferencia? ¿Y cuál es el porcentaje?».",
    hecho:
      "Día por día y producto por producto: pedidos de Shopify, compras que se atribuyen Meta y TikTok por separado, la diferencia, el factor (plataforma dividido Shopify, en verde hasta 10 % de diferencia, ámbar hasta 25 %, rojo más allá), el gasto, el CPA de plataforma contra el CPA real y el objetivo de la Calculadora. Suma lo que pidió Emilia: los pedidos que le llegan al equipo de ventas y la confirmación de cada día. Las cuentas de WhatsApp quedan afuera para no inflar el CPA.",
    donde: "Control publicitario > Shopify vs Ads",
  },
  {
    titulo: "El archivo de Emilia: Confirmación y CPA por producto",
    pedido:
      "Emilia, 10-nov: «ver los productos que son de riesgo bajo, los que son de medio riesgo, y los últimos que serían de altos riesgos… el tema de los testeos, verlos así».",
    hecho:
      "Con sus mismas reglas: cada producto va a su sección por la confirmación real de la planilla de ventas (70 % o más bajo riesgo, 57 % a 69,99 % medio, menos de 57 % alto), el CPA es gasto dividido pedidos y se pinta de rojo pasando de 6 dólares. Arriba, pedidos, confirmación, pedidos de plataforma, gasto y CPA; una tarjeta por sección con su barra; buscador por nombre o SKU; testeos aparte y los que tienen pauta sin pedidos. Jarvis le suma el top 10 por utilidad, la utilidad de cada producto, el SKU y las etiquetas.",
    donde: "Control publicitario > Riesgo por producto",
  },
];

/* ------------------------- 2. El resto del alcance ------------------------ */

const ALCANCE: Entrega[] = [
  {
    titulo: "Etiquetas de producto",
    pedido: "Fabrizio: «producto nuevo, permanente, activo, de testeo, a importar nuevamente, no importar, compra orgánica».",
    hecho:
      "Testeo, Activo, Apagado, Permanente, Nuevo, Volver a importar, No importar y Orgánico. Se ponen con «+ etiqueta» en cada producto y se ven en todo el panel y en el buscador de la Calculadora.",
    donde: "Riesgo por producto y Shopify vs Ads",
  },
  {
    titulo: "Los productos nuevos se crean solos",
    pedido: "Emilia: «¿habría alguna manera de que ya en automático se carguen los productos aquí en Jarvis?».",
    hecho:
      "Cada hora Jarvis revisa las campañas y crea la ficha de todo código que todavía no la tenga, con precio y costo del catálogo de Shopify. El 16-nov creó solas seis: Snowy, Beltrox, Melena de León, Rosa Eterna, Corazón y Espada y Kahi, con 21 campañas enganchadas.",
    donde: "Productos",
  },
  {
    titulo: "Todo sale de la Calculadora de precios",
    pedido: "Fabrizio: «que todo salga de ahí de la calculadora».",
    hecho:
      "En el mes en curso la economía del Control (efectividad, costos y gasto operativo por pedido) sale de la Calculadora; los meses cerrados quedan como se reportaron. La Calculadora muestra el SKU, marca los productos activos y agrupa en una sola línea las ofertas «Combo 1/2/3» y las copias «Product Id».",
    donde: "Calculadora de precios y Control publicitario",
  },
  {
    titulo: "El CPA es gasto dividido pedidos reales",
    pedido: "Fabrizio: «el CPA que vemos es el gasto dividido para los pedidos Shopify, ¿verdad?».",
    hecho:
      "Sí, en todo el panel. El CPA de plataforma se muestra al lado, para comparar, pero las decisiones se toman con el real.",
    donde: "Control publicitario, Panel",
  },
  {
    titulo: "Meta directo, sin depender de Windsor",
    pedido: "Fabrizio: «¿no tienes otra manera de conectar Jarvis de manera directa?».",
    hecho:
      "Listo para usar: con un token del Business Manager, Jarvis lee Meta directamente cada 10 minutos y deja de depender de Windsor para Meta. Falta que se pegue el token (ver pendientes).",
    donde: "Conexiones > Meta",
  },
  {
    titulo: "Panel: lo que reportan las plataformas, sin recortar",
    hecho:
      "El bloque «Ventas reales contra lo que atribuye la pauta» recortaba lo reportado a los pedidos reales y mostraba 0 %. Ahora dice cuánto reportan Meta y TikTok, la diferencia con signo y el factor.",
    donde: "Panel",
  },
];

/* --------------------- 3. Ordenado de datos del 16-nov -------------------- */

const ORDEN: Entrega[] = [
  {
    titulo: "Los testeos, marcados como en el archivo de Emilia",
    hecho:
      "Se crearon las fichas de los productos en prueba y se marcaron como Testeo: VEV DeepCalm, Yesnap Creatina, medicube NAD, Power Bank 10000, Power Bank 3 en 1, Pulsera Pixiu, Fwee Mist, Uric Acid Purge, Fundas al vacío y Baïa, más Neurobion y Ojara (lanzados el 11-nov). Sus 30 campañas no llevaban código en el nombre, por eso su gasto quedaba sin producto; ahora están asignadas.",
    donde: "Riesgo por producto > Testeos",
  },
  {
    titulo: "Ningún nombre de la planilla sin enlazar",
    hecho:
      "37 nombres de la planilla y de Shopify enlazados a su producto: MAYAVERRA al drenaje, Jecanori a la pulsera de cobre (misma campaña), la mascarilla PDRN a la ficha con pauta, Cutting Mix (Suplemento + LeeFar) a su propia ficha, la Arbutin y el Kit Celimax por su Product Id.",
    donde: "Control publicitario > Enlazar pedidos",
  },
];

/* -------------------------- 4. Capacitación ------------------------------- */

const CAPACITACION: Entrega[] = [
  {
    titulo: "Un video por pantalla, en la burbuja de Ayuda",
    hecho:
      "Cada pantalla tiene su video corto con voz y subtítulos, grabado sobre el panel real: también Riesgo por producto (regrabado con las reglas nuevas) y Nómina. La burbuja «Ayuda», abajo a la derecha, trae además los pasos de la pantalla, preguntas frecuentes y un buscador.",
    donde: "Burbuja «Ayuda» en todas las pantallas",
  },
  {
    titulo: "La guía «Qué hacer ahora»",
    hecho:
      "Arriba de Riesgo por producto, mientras quede algo por hacer: cuántos nombres faltan enlazar, si hay testeos marcados y el video. Se cierra sola cuando no queda nada.",
    donde: "Riesgo por producto",
  },
];

type Pendiente = { que: string; porque: string; quien: string };

const PENDIENTES: Pendiente[] = [
  {
    que: "Pegar el token de Meta en Conexiones > Meta",
    porque:
      "La cuenta CP2 - Top Ventas no entrega datos desde el 10 de noviembre (venía gastando unos 222 dólares al día) y Meta por Windsor está fallando. Mientras siga así, el CPA y la utilidad salen mejores de lo real. Con el token, Jarvis lee Meta directo. Pasos: en el Business Manager, crear un usuario del sistema con todas las cuentas publicitarias, generar el token con permiso ads_read y vencimiento Nunca, y pegarlo. Ya está avisado en la campana de Jarvis.",
    quien: "Fabrizio",
  },
  {
    que: "Revisar el CPA objetivo del drenaje y de los testeos nuevos",
    porque:
      "El de las gotas de drenaje está en 2,67 dólares y parece mal cargado; los testeos nuevos quedaron con 10 dólares provisional. Se cambian en la Calculadora de precios.",
    quien: "Emilia",
  },
  {
    que: "Anuncios de TikTok (detalle por anuncio)",
    porque:
      "Desde el 16-nov Windsor no alcanza a responder el pedido de anuncios de las 37 cuentas de TikTok. La pauta y las compras de TikTok por campaña siguen entrando bien; solo falta el detalle por anuncio. Jarvis lo reintenta solo cada 30 minutos pidiendo menos días; si sigue, se le escribe al soporte de Windsor.",
    quien: "Windsor (Jarvis lo reintenta solo)",
  },
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "entregas", "Jarvis_Estado_de_alcance_16_noviembre.pdf");
fs.mkdirSync(path.dirname(salida), { recursive: true });
doc.pipe(fs.createWriteStream(salida));

const ANCHO = doc.page.width - 96;

/* ------------------------------- Dibujo ---------------------------------- */

function seccion(texto: string, bajada?: string) {
  if (doc.y > doc.page.height - 200) doc.addPage();
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

/** Una entrega, medida antes de dibujarla para no partirla entre páginas. */
function ficha(a: Entrega) {
  const anchoTexto = ANCHO - 28;
  const bloques: [string, string][] = [
    ["QUÉ QUEDÓ", a.hecho],
    ["DÓNDE ESTÁ", a.donde],
  ];
  let alto = 34;
  doc.fontSize(12);
  alto += doc.heightOfString(a.titulo, { width: anchoTexto - 70 }) - 14;
  if (a.pedido) alto += doc.fontSize(9).heightOfString(a.pedido, { width: anchoTexto }) + 8;
  for (const [etiqueta, cuerpo] of bloques) {
    alto += doc.fontSize(8).heightOfString(etiqueta, { width: anchoTexto });
    alto += doc.fontSize(9.5).heightOfString(cuerpo, { width: anchoTexto }) + 7;
  }
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).lineWidth(0.7).strokeColor(COLOR.borde).stroke();
  // La marca de entregado, arriba a la derecha.
  doc.roundedRect(48 + ANCHO - 82, y0 + 10, 70, 16, 8).fill(COLOR.bienFondo);
  doc.fontSize(8).fillColor(COLOR.bien).text("ENTREGADO", 48 + ANCHO - 82, y0 + 14.5, { width: 70, align: "center" });
  doc.fontSize(12).fillColor(COLOR.tinta).text(a.titulo, 62, y0 + 12, { width: anchoTexto - 90 });
  if (a.pedido) doc.fontSize(9).fillColor(COLOR.marca).text(a.pedido, 62, doc.y + 5, { width: anchoTexto });
  for (const [etiqueta, cuerpo] of bloques) {
    doc.fontSize(8).fillColor(COLOR.suave).text(etiqueta, 62, doc.y + 7, { width: anchoTexto });
    doc.fontSize(9.5).fillColor(COLOR.tinta).text(cuerpo, 62, doc.y + 1, { width: anchoTexto });
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
doc.fillColor("#ffffff").fontSize(23).text("Estado de alcance", 48, 32, { width: ANCHO });
doc
  .fillColor("#cfe9df")
  .fontSize(11)
  .text("Lo pedido en la llamada del 10 de noviembre, cómo quedó en Jarvis y qué falta del lado del equipo", 48, 64, {
    width: ANCHO,
  });
doc.fillColor(COLOR.tinta);
doc.y = 134;
doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text("Importadora Bella · jarvisecom.com · 16 de noviembre de 2026", 48, doc.y, { width: ANCHO });
doc.moveDown(1);

recuadro(
  "Lo más importante en tres líneas",
  "Los dos archivos que mostraron en la llamada ya viven dentro de Jarvis y se actualizan solos: el de Fabrizio (Shopify contra Meta y TikTok) y el de Emilia (confirmación y CPA por producto, con sus mismas reglas). " +
    "Del 1 al 8 de noviembre Jarvis da lo mismo que el archivo de Emilia en pedidos, secciones y testeos. " +
    "Lo único urgente que falta es el token de Meta: sin él, una cuenta grande no entra y el CPA sale más bajo de lo real.",
  COLOR.bienFondo,
  COLOR.bienFondo,
);

/* --------------------------- Contra el archivo ---------------------------- */
seccion(
  "El archivo de Emilia contra Jarvis",
  "Mismo período: del 1 al 8 de noviembre. Jarvis lo calcula solo, a partir de la planilla de ventas y de Meta y TikTok.",
);
tabla(
  [
    ["", "Archivo de Emilia", "Jarvis"],
    ["Pedidos", "4.128", "4.120"],
    ["Confirmación", "70,47 %", "71,72 %"],
    ["Bajo riesgo (70 % o más)", "20 productos", "20 productos"],
    ["Alto riesgo (menos de 57 %)", "2 productos · 11 pedidos", "2 productos · 11 pedidos"],
    ["Testeos", "10 productos", "10 productos"],
    ["Gasto Meta + TikTok", "$21.616", "$25.619"],
    ["CPA general", "$5,24", "$6,22"],
  ],
  [ANCHO * 0.4, ANCHO * 0.3, ANCHO * 0.3],
);
doc
  .fontSize(8.5)
  .fillColor(COLOR.suave)
  .text(
    "La confirmación sube un poco porque la planilla siguió confirmando pedidos después de armar el archivo. El gasto sí es distinto, y el correcto es el de Jarvis: en el archivo, el gasto de Meta se reconstruía como conversiones por costo por conversión (el consolidado lo traía en cero), y así queda afuera todo lo gastado en anuncios que no convirtieron. Por eso allá el CPA salía 5,24 y el real es 6,22.",
    48,
    doc.y,
    { width: ANCHO },
  );
doc.moveDown(0.4);

/* ------------------------------ Las secciones ---------------------------- */
seccion("1 · Los dos archivos de la llamada", "Ya no hace falta descargar reportes de cada cuenta: se llenan solos.");
for (const a of ARCHIVOS) ficha(a);

seccion("2 · El resto de lo pedido", "Lo que se pidió en la llamada del 10 de noviembre y en los audios de esa semana.");
for (const a of ALCANCE) ficha(a);

seccion("3 · Datos ordenados el 16 de noviembre", "Para que Riesgo por producto quede igual al archivo desde el primer día.");
for (const a of ORDEN) ficha(a);

seccion("4 · Capacitación");
for (const a of CAPACITACION) ficha(a);
recuadro(
  "El enlace de capacitación para Emilia",
  `${LINK_CAPACITACION}\n\nAbre el recorrido guiado directamente en «Shopify vs Ads», con la voz; con «Siguiente» pasa a «Riesgo por producto». Hay que tener la sesión iniciada en Jarvis.`,
  COLOR.fondo,
  COLOR.borde,
);

/* --------------------------------- Pendientes ---------------------------- */
seccion(
  "Lo que queda, y no lo puede hacer el programa",
  "Necesitan un acceso o una decisión del equipo. Fuera del alcance, por decisión: el correo de reportes (Resend) no se va a usar; Jarvis lo muestra como «apagado» y los avisos siguen llegando por la campana.",
);
PENDIENTES.forEach((p, i) => pendiente(p, i + 1));

/* -------------------------------- Pie de página -------------------------- */
const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(`Importadora Bella · Jarvis · Estado de alcance · ${i + 1} de ${paginas.count}`, 48, doc.page.height - 38, {
      width: ANCHO,
      align: "center",
      lineBreak: false,
    });
}

doc.end();
console.log("PDF escrito en", salida);
