/**
 * El paso a paso para volver a conectar una cuenta publicitaria en Windsor.
 *
 * Pedido de Sebastián el 17 de octubre, después de que Emilia reportara que
 * «gotas de drenaje linfático» mostraba una compra cuando el administrador de
 * anuncios mostraba veintidós. No era el producto: la cuenta CP1 - Top Ventas
 * llevaba cuatro días sin entregarle datos a Windsor.
 *
 * PARA QUIÉN ESTÁ ESCRITO. Para Emilia, que no tiene por qué saber qué es
 * Windsor ni qué es un token. Por eso cada paso dice qué apretar y, sobre todo,
 * QUÉ TIENE QUE VER cuando salió bien: un instructivo que no dice cómo se ve el
 * éxito obliga a volver a preguntar, y entonces no sirvió de nada.
 *
 * LO QUE NO SÉ, LO DIGO. La documentación de Windsor no publica los nombres
 * exactos de sus botones y la interfaz les cambia. Así que los pasos nombran lo
 * que hay que buscar —la sección de orígenes de datos, el conector de Facebook,
 * la lista de cuentas— y no fingen una precisión que no tengo. Lo que sí está
 * medido al detalle es cómo comprobar el resultado desde Jarvis, que es nuestro.
 *
 * CARACTERES QUE NO ENTRAN. pdfkit escribe en WinAnsi con las fuentes que trae,
 * y ahí no existen el signo menos matemático (U+2212) ni la flecha. Salen como
 * una comilla suelta, sin aviso. Guion normal y «>» en su lugar.
 *
 *   npx tsx scripts/pdf-reconectar-cuenta.ts
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { pasosParaReconectar, type PasoReconectar } from "@/lib/pasos-reconectar";

const COLOR = {
  tinta: "#1a1a1a",
  suave: "#616161",
  borde: "#e1e3e5",
  marca: "#008060",
  marcaFuerte: "#004c3f",
  bien: "#0f7a4f",
  bienFondo: "#e3f5eb",
  ojo: "#b26e00",
  ojoFondo: "#fff4e0",
  malo: "#b42318",
  maloFondo: "#fdecea",
};

const CUENTAS = [
  ["CP3 - Top Ventas", "1507602524109494", "21 de octubre", "se reconectó y se volvió a caer a los tres días"],
];

// Los pasos NO se escriben acá. Son los mismos que la app dibuja en el aviso
// del tablero, y vienen de src/lib/pasos-reconectar.ts: el instructivo y la
// pantalla tienen que decir lo mismo, y cuando eran dos textos separados ya
// empezaban a separarse. Si hay que mejorar un paso, se mejora allá.
const PASOS: PasoReconectar[] = pasosParaReconectar({
  nombre: CUENTAS[0][0],
  externalId: CUENTAS[0][1],
  ultimoDia: CUENTAS[0][2],
  conector: "Facebook Ads",
});

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "Jarvis_Reconectar_cuenta_Windsor.pdf");
doc.pipe(fs.createWriteStream(salida));
const ANCHO = doc.page.width - 96;

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

/** Un paso, medido antes de dibujarse para que no quede partido entre páginas. */
function paso(n: number, p: PasoReconectar) {
  const anchoTexto = ANCHO - 34;
  const altoCuerpo = doc.fontSize(9.8).heightOfString(p.cuerpo, { width: anchoTexto });
  const altoSeVe = p.seVeAsi ? doc.fontSize(9).heightOfString(p.seVeAsi, { width: anchoTexto - 16 }) + 26 : 0;
  const alto = 22 + altoCuerpo + altoSeVe + 18;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.circle(56, y0 + 7, 8).fillAndStroke(COLOR.marca, COLOR.marca);
  doc
    .fillColor("#ffffff")
    .fontSize(9)
    .text(String(n), 48, y0 + 3.5, { width: 16, align: "center" });

  doc.fillColor(COLOR.tinta).fontSize(10.8).text(p.titulo, 74, y0, { width: anchoTexto });
  doc.moveDown(0.25);
  doc.fillColor(COLOR.suave).fontSize(9.8).text(p.cuerpo, 74, doc.y, { width: anchoTexto });

  if (p.seVeAsi) {
    doc.moveDown(0.35);
    const yy = doc.y;
    const altoCaja = doc.fontSize(9).heightOfString(p.seVeAsi, { width: anchoTexto - 16 }) + 18;
    doc.roundedRect(74, yy, anchoTexto, altoCaja, 5).fillAndStroke(COLOR.bienFondo, "#cce9db");
    doc
      .fillColor(COLOR.bien)
      .fontSize(9)
      .text(p.seVeAsi, 82, yy + 9, { width: anchoTexto - 16 });
    doc.y = yy + altoCaja;
  }
  doc.moveDown(0.9);
}

/* -------------------------------- Portada -------------------------------- */

doc.fillColor(COLOR.marcaFuerte).fontSize(22).text("Volver a conectar una cuenta publicitaria", 48, 56, {
  width: ANCHO,
});
doc.fillColor(COLOR.suave).fontSize(11).text("Importadora Bella - Jarvis - 29 de octubre de 2026", 48, doc.y + 6);
doc.moveDown(1.2);

recuadro(
  "Qué pasó, en una línea",
  "Una cuenta publicitaria de Meta dejó de entregarle datos a Windsor, que es de donde Jarvis los lee. " +
    "Las campañas siguen corriendo y vendiendo con normalidad: lo que se cortó es lo que llega al panel. " +
    "La cuenta grande, CP1 - Top Ventas, ya se reconectó y volvió a entrar completa, incluidos los días que " +
    "había perdido. Queda esta, que se reconectó el 17 y se volvió a caer el 21.",
  COLOR.ojoFondo,
  "#f3dcae",
);

/* ------------------------------ Las cuentas ------------------------------ */

seccion("La cuenta que hay que reconectar", "Estaba gastando; no entrega datos desde la fecha que figura.");

const COLS = [48, 220, 330, 430];
doc.fontSize(8.5).fillColor(COLOR.suave);
doc.text("CUENTA", COLS[0], doc.y, { width: 165, continued: false });
const yCab = doc.y - 11;
doc.text("NÚMERO", COLS[1], yCab, { width: 105 });
doc.text("SIN DATOS DESDE", COLS[2], yCab, { width: 95 });
doc.text("CUÁNTO PESA", COLS[3], yCab, { width: ANCHO + 48 - COLS[3] });
doc
  .moveTo(48, doc.y + 3)
  .lineTo(doc.page.width - 48, doc.y + 3)
  .lineWidth(0.5)
  .strokeColor(COLOR.borde)
  .stroke();
doc.moveDown(0.6);

for (const [nombre, id, desde, peso] of CUENTAS) {
  const y = doc.y;
  doc.fillColor(COLOR.tinta).fontSize(9.5).text(nombre, COLS[0], y, { width: 165 });
  doc.fillColor(COLOR.suave).fontSize(9).text(id, COLS[1], y, { width: 105 });
  doc.fillColor(COLOR.malo).fontSize(9).text(desde, COLS[2], y, { width: 95 });
  doc.fillColor(COLOR.suave).fontSize(9).text(peso, COLS[3], y, { width: ANCHO + 48 - COLS[3] });
  doc.y = Math.max(doc.y, y + 14);
}
doc.moveDown(0.8);

recuadro(
  "Tres cuentas más, pero estas no corren prisa",
  "CP4 - Bellav Corp (1619282889822423), CP5 - Bellav Corp (1551582923215856) y CP3 - Mundo Hogar " +
    "(2004087387076735) tampoco entregan datos, pero tampoco gastan desde hace semanas. Si ya no se usan, no hay " +
    "nada que hacer; si se van a volver a usar, hay que reconectarlas ANTES de encender campañas, o el gasto no " +
    "va a aparecer en el panel.",
  "#f6f6f7",
  COLOR.borde,
);

recuadro(
  "Y una cuenta distinta, que sí entrega datos: CP2 - Top Ventas",
  "Esta no está desconectada, así que no hace falta tocar Windsor. El asunto es otro: gastó $1.517 en los " +
    "últimos siete días, trajo 31.025 clics y no registró NI UNA compra. Sus campañas llevan «WP» en el nombre. " +
    "Si son campañas a WhatsApp, está bien que sea así —la venta se cierra en el chat y el píxel no tiene cómo " +
    "verla—, pero entonces su gasto no se puede comparar con el de las demás: entra en el total de Meta y sus " +
    "ventas no, así que empeora el CPA general de la tienda. Si NO son de WhatsApp, hay que revisar el píxel de " +
    "esa cuenta. Avísanos cuál de las dos es y lo dejamos contemplado en el panel.",
  COLOR.ojoFondo,
  "#f3dcae",
);

/* -------------------------------- Los pasos ------------------------------ */

seccion("Paso a paso");
PASOS.forEach((p, i) => paso(i + 1, p));

/* ------------------------------ Lo que cambió ---------------------------- */

seccion(
  "Lo que cambió en Jarvis para que esto no vuelva a pasar en silencio",
  "Las tres pantallas donde uno miraría decían que todo iba bien. Ya no.",
);

doc.fillColor(COLOR.suave).fontSize(9.8);
const CAMBIOS = [
  "El tablero de sincronización se pone en ROJO cuando una cuenta que venía gastando deja de traer datos, y nombra cuál. Antes solo avisaba si la plataforma entera dejaba de responder: siete cuentas de diez era una respuesta válida y nadie se enteraba.",
  "En Conexiones, cada tarjeta dice de cuándo son sus últimos números. Antes las doce decían «Conectada», que solo quería decir que alguien las dio de alta alguna vez.",
  "El botón «Sincronizar ahora» ahora funciona y contesta lo único que importa: si Windsor devolvió esa cuenta o si contestó bien pero sin ella. Antes no podía funcionar en ninguna cuenta y respondía un error sobre un token que no es el que se usa.",
];
for (const c of CAMBIOS) {
  const y = doc.y;
  doc.circle(53, y + 5, 2).fill(COLOR.marca);
  doc.fillColor(COLOR.suave).fontSize(9.8).text(c, 64, y, { width: ANCHO - 16 });
  doc.moveDown(0.5);
}

/* -------------------------------- Pie ------------------------------------ */

const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  doc
    .fillColor(COLOR.suave)
    .fontSize(8)
    .text(`Importadora Bella - Jarvis - ${i + 1} de ${paginas.count}`, 48, doc.page.height - 38, {
      width: ANCHO,
      align: "center",
      lineBreak: false,
    });
}

doc.end();
console.log(`PDF escrito en ${salida}`);
