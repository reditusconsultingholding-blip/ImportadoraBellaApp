/**
 * El seguimiento de lo que reportó Emilia: en qué quedó cada cosa y qué hacer
 * la próxima vez sin esperar a nadie.
 *
 * Pedido de Sebastián el 29 de octubre. El informe anterior explicaba qué
 * había pasado; este cierra el círculo: qué se hizo con cada novedad, qué
 * queda y de quién depende, y —lo principal— el camino para resolverlo sola
 * la próxima vez, que ahora empieza en el propio panel y no en un documento.
 *
 * LO QUE NO SE DICE. No dice «ya quedó todo resuelto», porque no es cierto:
 * dos de las tres novedades esperan algo que solo el equipo de Bella puede
 * hacer —reconectar una cuenta en Windsor y mirar cómo se llaman las campañas
 * de otra—. Lo que sí quedó cerrado es nuestra parte: que el panel lo avise
 * solo, a tiempo, en la primera pantalla y con los pasos adentro. Prometer de
 * más en un documento de seguimiento es la forma más rápida de que el próximo
 * no se lea.
 *
 * CARACTERES QUE NO ENTRAN. pdfkit escribe en WinAnsi con las fuentes que
 * trae, y ahí no existen el signo menos matemático (U+2212) ni la flecha.
 * Salen como una comilla suelta, sin aviso. Guion normal y «>» en su lugar.
 *
 *   npx tsx scripts/pdf-seguimiento-emilia.ts
 */
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";

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
  frio: "#f4f6f8",
};

type Estado = "CERRADO DE NUESTRO LADO" | "ESPERA TU RESPUESTA" | "NO HABÍA NADA ROTO";

type Seguimiento = {
  numero: number;
  titulo: string;
  reporte: string;
  /** Qué se hizo, con fecha. Es la prueba de que el reporte no se archivó. */
  hecho: string;
  /** Qué queda, y de quién depende. Vacío si no queda nada. */
  falta?: string;
  estado: Estado;
};

const SEGUIMIENTOS: Seguimiento[] = [
  {
    numero: 1,
    titulo: "Una cuenta entera no estaba entregando datos",
    reporte:
      "«En gotas de drenaje linfático solo sale una compra» y «la cuenta 3 no está cargando». Tenías razón: " +
      "no era el producto, era la cuenta completa. CP1 - Top Ventas, la que más gastaba de las doce, llevaba " +
      "cuatro días sin entregarle una sola fila a Windsor, y en el panel eso se veía como un producto que no vendía.",
    hecho:
      "CP1 - Top Ventas se reconectó y Windsor rellenó los días que faltaban, del 13 al 16 de octubre: ese gasto " +
      "ya está en el panel. Y se agregó la alarma que no existía: el tablero se pone en rojo cuando una cuenta " +
      "que venía gastando deja de entregar datos, dice cuál, desde cuándo y cuántos días van. Desde hoy ese aviso " +
      "aparece en la primera pantalla del panel, arriba de las cifras, y trae el paso a paso adentro, ya con el " +
      "nombre y el número de la cuenta que falló. Y una cosa más, que era un agujero: el aviso ya no se apaga " +
      "con el paso del tiempo. Antes, al día once dejaba de avisar — no porque alguien lo hubiera arreglado, " +
      "sino porque el calendario avanzó.",
    falta:
      "Reconectar CP3 - Top Ventas (1507602524109494), que sigue sin entregar datos desde el 21 de octubre. Es la " +
      "única que queda, y solo se puede hacer desde Windsor con el usuario que administra esas cuentas. El paso a " +
      "paso está en el aviso rojo del panel y en el otro documento.",
    estado: "CERRADO DE NUESTRO LADO",
  },
  {
    numero: 2,
    titulo: "Una cuenta que gasta y no registra ninguna compra",
    reporte:
      "Esta no la reportó nadie: apareció mientras se revisaba la primera. CP2 - Top Ventas entrega datos todos " +
      "los días, gastó $1.544 en los últimos siete y registró cero compras. Su gasto entra en el total de Meta y " +
      "sus ventas no, así que el CPA general de la tienda sale peor del que es.",
    hecho:
      "Se agregó la segunda alarma, que tampoco existía: una cuenta que gasta y no registra ni una compra queda " +
      "en ámbar, con el gasto de los últimos siete días a la vista. Y se agregó el botón para cerrarla sin " +
      "esperar a nadie: si son campañas a WhatsApp, lo marcas y el aviso se calla para esa cuenta. Si algún día " +
      "registra una compra por la web, la marca se levanta sola y el aviso vuelve.",
    falta:
      "Mirar cómo se llaman las campañas que están gastando en esa cuenta. Si llevan «WP», «WhatsApp» o " +
      "«Mensajes», la venta se cierra en el chat, el píxel no tiene cómo verla y no hay nada roto: marcas el " +
      "botón y listo. Si son campañas de ventas a la web, hay que revisar el píxel de esa cuenta en el " +
      "Administrador de eventos de Meta — los pasos también están en el aviso.",
    estado: "ESPERA TU RESPUESTA",
  },
  {
    numero: 3,
    titulo: "El 20 % de ventas que «el píxel no registra»",
    reporte:
      "«Hay una diferencia de 23 ventas, es el 20 %, el píxel no las está registrando». Acá la respuesta es " +
      "distinta de las otras dos: ese 20 % no es un agujero, es el reloj. Un pedido entra en la tienda en el " +
      "momento en que se hace; la compra tarda en aparecer del lado de Meta y TikTok. A media mañana la pauta va " +
      "siempre por detrás, y la diferencia se cierra sola durante el día.",
    hecho:
      "Se revisaron los seis días cerrados anteriores, pedidos de la tienda contra compras atribuidas: 328/291, " +
      "336/320, 372/421, 321/271, 272/290 y 334/350. La diferencia final va de -16 % a +13 %, y en tres de esos " +
      "seis días la pauta se atribuye MÁS ventas de las que entraron. No hay un 20 % que se pierda siempre. " +
      "Además el panel ahora lo dice solo: cuando el período que estás mirando incluye el día de hoy, aparece una " +
      "línea avisando que el día todavía no cerró.",
    estado: "NO HABÍA NADA ROTO",
  },
];

/** El camino para la próxima vez. Empieza en el panel, no en un documento. */
const PROXIMA_VEZ: { titulo: string; cuerpo: string; seVeAsi?: string }[] = [
  {
    titulo: "No vas a tener que descubrirlo: el panel te lo dice",
    cuerpo:
      "Entra a jarvisecom.com como siempre. Si una cuenta dejó de entregar datos, lo primero que vas a ver " +
      "—arriba de las ventas y del CPA— es un aviso rojo con el nombre de la cuenta, desde qué día no trae " +
      "números y cuántos días van. No hace falta entrar a ninguna otra pantalla ni acordarse de revisar nada.",
    seVeAsi:
      "«CP3 - Top Ventas no está entregando datos desde el 21 de octubre · 8 días». Y debajo, qué número de los " +
      "de abajo no hay que creer: con una cuenta caída, el CPA y la utilidad salen MEJORES que los reales, " +
      "porque las ventas están en la tienda y su gasto no.",
  },
  {
    titulo: "Los pasos ya vienen abiertos ahí mismo",
    cuerpo:
      "Dentro del aviso rojo están los siete pasos para reconectarla, con el nombre y el número de esa cuenta " +
      "metidos en el texto — no un instructivo genérico que haya que traducir. Vienen abiertos a propósito: " +
      "ocupan media pantalla porque mientras eso siga, el CPA de abajo está mal.",
  },
  {
    titulo: "De los siete pasos, hay uno donde se pierde todo el mundo",
    cuerpo:
      "Cuando Windsor te muestre la lista de cuentas publicitarias después de iniciar sesión, marca TODAS las " +
      "que se usen, no solo la que fuiste a arreglar. La pantalla suele venir con unas pocas marcadas y es fácil " +
      "dar por hecho que están todas. Ya pasó: el 17 de octubre se reconectaron tres cuentas y una se volvió a " +
      "caer a los tres días.",
  },
  {
    titulo: "Compruébalo en el momento, sin esperar a mañana",
    cuerpo:
      "Entra a Conexiones, busca la tarjeta de la cuenta y aprieta «Sincronizar ahora». Te contesta lo único que " +
      "importa: si Windsor devolvió esa cuenta, o si contestó bien pero sin ella. Eso es lo que antes no se podía " +
      "saber, y por eso en Windsor se veía «conectada» mientras en el panel faltaban datos.",
    seVeAsi:
      "La tarjeta pasa de «Sin datos hace N días», en rojo, a «Al día» con la fecha de hoy. El aviso del tablero " +
      "desaparece solo en la siguiente vuelta del reloj, que es de un par de minutos. Si el aviso sigue ahí, es " +
      "que la cuenta todavía no está entregando datos: no te quedes con la duda.",
  },
  {
    titulo: "Si la cuenta está apagada a propósito, dilo y el aviso se calla",
    cuerpo:
      "Hay cuentas que no se usan más, y un aviso rojo permanente por algo que nadie va a arreglar es la forma " +
      "más segura de que el equipo aprenda a ignorar el rojo. En el mismo aviso hay un botón para declararlo. " +
      "Queda anotado quién lo marcó, y si esa cuenta vuelve a entregar datos la marca se levanta sola: nadie " +
      "tiene que acordarse de volver a prenderla.",
  },
];

const ALARMAS: [string, string, string][] = [
  [
    "ROJO · «no está entregando datos»",
    "La cuenta venía gastando y dejó de mandar números. Se arregla en Windsor, reconectando el conector.",
    "Mientras siga: el CPA y la utilidad del panel salen MEJORES que los reales.",
  ],
  [
    "ÁMBAR · «gasta y no registra ninguna compra»",
    "La cuenta manda todo menos ventas. Se resuelve en Meta —el píxel— o se declara que vende por WhatsApp.",
    "Mientras siga: el CPA general sale PEOR del que es.",
  ],
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "Jarvis_Seguimiento_29-oct.pdf");
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

const TONO_ESTADO: Record<Estado, [string, string]> = {
  "CERRADO DE NUESTRO LADO": [COLOR.bien, COLOR.bienFondo],
  "ESPERA TU RESPUESTA": [COLOR.ojo, COLOR.ojoFondo],
  "NO HABÍA NADA ROTO": [COLOR.marca, COLOR.bienFondo],
};

/** Una ficha de seguimiento, medida antes de dibujarse para no partirla. */
function ficha(s: Seguimiento) {
  const anchoTexto = ANCHO - 28;
  const bloques: [string, string][] = [
    ["LO QUE SE REPORTÓ", s.reporte],
    ["QUÉ SE HIZO", s.hecho],
  ];
  if (s.falta) bloques.push(["QUÉ FALTA, Y SOLO LO PUEDEN HACER USTEDES", s.falta]);

  let alto = 34;
  for (const [, cuerpo] of bloques) {
    alto += 13 + doc.fontSize(9.5).heightOfString(cuerpo, { width: anchoTexto }) + 7;
  }
  alto += 10;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).fillAndStroke("#ffffff", COLOR.borde);

  const [tinta, fondo] = TONO_ESTADO[s.estado];
  const anchoChip = doc.fontSize(7.5).widthOfString(s.estado) + 14;
  doc.roundedRect(doc.page.width - 48 - 16 - anchoChip, y0 + 14, anchoChip, 14, 3).fill(fondo);
  doc
    .fillColor(tinta)
    .fontSize(7.5)
    .text(s.estado, doc.page.width - 48 - 16 - anchoChip, y0 + 18, {
      width: anchoChip,
      align: "center",
    });

  doc
    .fillColor(COLOR.marca)
    .fontSize(9)
    .text(`NOVEDAD ${s.numero}`, 62, y0 + 13, { width: anchoTexto - anchoChip - 20 });
  doc
    .fillColor(COLOR.tinta)
    .fontSize(11)
    .text(s.titulo, 62, doc.y + 1, { width: anchoTexto - anchoChip - 20 });
  doc.moveDown(0.45);

  for (const [etiqueta, cuerpo] of bloques) {
    doc.fillColor(COLOR.suave).fontSize(7.5).text(etiqueta, 62, doc.y, { width: anchoTexto });
    doc.fillColor(COLOR.tinta).fontSize(9.5).text(cuerpo, 62, doc.y + 1.5, { width: anchoTexto });
    doc.moveDown(0.5);
  }

  doc.y = y0 + alto + 12;
}

/** Un paso del camino de la próxima vez. */
function paso(n: number, p: { titulo: string; cuerpo: string; seVeAsi?: string }) {
  const anchoTexto = ANCHO - 34;
  const altoCuerpo = doc.fontSize(9.8).heightOfString(p.cuerpo, { width: anchoTexto });
  const altoSeVe = p.seVeAsi
    ? doc.fontSize(9).heightOfString(p.seVeAsi, { width: anchoTexto - 16 }) + 26
    : 0;
  const alto = 22 + altoCuerpo + altoSeVe + 18;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.circle(56, y0 + 7, 8).fillAndStroke(COLOR.marca, COLOR.marca);
  doc
    .fillColor("#ffffff")
    .fontSize(9)
    .text(String(n), 48, y0 + 3.5, { width: 16, align: "center" });

  doc.fillColor(COLOR.tinta).fontSize(10.8).text(p.titulo, 74, y0, { width: anchoTexto });
  doc.fillColor(COLOR.suave).fontSize(9.8).text(p.cuerpo, 74, doc.y + 3, { width: anchoTexto });

  if (p.seVeAsi) {
    const y1 = doc.y + 8;
    const altoCaja = doc.fontSize(9).heightOfString(p.seVeAsi, { width: anchoTexto - 16 }) + 26;
    doc.roundedRect(74, y1, anchoTexto, altoCaja, 5).fillAndStroke(COLOR.bienFondo, "#cce9db");
    doc.fillColor(COLOR.bien).fontSize(7.5).text("SE VE ASÍ", 86, y1 + 8, { width: anchoTexto - 24 });
    doc
      .fillColor(COLOR.suave)
      .fontSize(9)
      .text(p.seVeAsi, 86, doc.y + 1, { width: anchoTexto - 24 });
    doc.y = y1 + altoCaja;
  }

  doc.moveDown(0.8);
}

/* -------------------------------- Portada -------------------------------- */

doc.fillColor(COLOR.marcaFuerte).fontSize(21).text("Lo que reportaste: en qué quedó", 48, 56, {
  width: ANCHO,
});
doc
  .fillColor(COLOR.suave)
  .fontSize(11)
  .text("Importadora Bella - Jarvis - 29 de octubre de 2026", 48, doc.y + 6);
doc.moveDown(1.2);

recuadro(
  "En una línea",
  "De tu reporte salieron tres novedades distintas, y las tres tienen respuesta. Nuestra parte quedó cerrada: " +
    "desde hoy el panel avisa solo —en la primera pantalla, antes de cualquier cifra— cuando una cuenta deja de " +
    "entregar datos o gasta sin registrar ventas, dice cuál y desde cuándo, y trae los pasos para arreglarlo " +
    "adentro del aviso. Quedan dos cosas que solo ustedes pueden hacer, y ahora el panel te las va a pedir sin " +
    "que nadie tenga que acordarse.",
  COLOR.frio,
  COLOR.borde,
);

/* ----------------------------- El seguimiento ---------------------------- */

seccion(
  "Las tres novedades, una por una",
  "Qué se reportó, qué se hizo con eso y qué queda. Ninguna se archivó.",
);
SEGUIMIENTOS.forEach(ficha);

/* --------------------------- La próxima vez ------------------------------ */

seccion(
  "Si vuelve a pasar, lo resuelves sin esperar a nadie",
  "Esto es lo que cambió de verdad para ti: antes había que sospechar algo, pedir que lo revisáramos y esperar. " +
    "Ahora el camino entero está dentro del panel.",
);
PROXIMA_VEZ.forEach((p, i) => paso(i + 1, p));

/* ---------------------------- Las dos alarmas ---------------------------- */

seccion(
  "Las dos alarmas, y qué significa cada una",
  "Son dos problemas distintos, se arreglan en lugares distintos y tiran el CPA para lados opuestos. Por eso " +
    "tienen colores distintos y nunca se mezclan en un mismo aviso.",
);

for (const [titulo, donde, efecto] of ALARMAS) {
  const rojo = titulo.startsWith("ROJO");
  const anchoTexto = ANCHO - 26;
  const altoDonde = doc.fontSize(9.5).heightOfString(donde, { width: anchoTexto });
  const altoEfecto = doc.fontSize(9).heightOfString(efecto, { width: anchoTexto });
  const alto = 16 + altoDonde + altoEfecto + 22;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();
  const y0 = doc.y;
  doc
    .roundedRect(48, y0, ANCHO, alto, 6)
    .fillAndStroke(rojo ? COLOR.maloFondo : COLOR.ojoFondo, rojo ? "#f3c9c2" : "#f3dcae");
  doc
    .fillColor(rojo ? COLOR.malo : COLOR.ojo)
    .fontSize(10.3)
    .text(titulo, 62, y0 + 11, { width: anchoTexto });
  doc.fillColor(COLOR.tinta).fontSize(9.5).text(donde, 62, doc.y + 2, { width: anchoTexto });
  doc.fillColor(COLOR.suave).fontSize(9).text(efecto, 62, doc.y + 2, { width: anchoTexto });
  doc.y = y0 + alto + 10;
}

/* ------------------------------ El cierre -------------------------------- */

seccion("Lo que cambió, en una frase");

recuadro(
  "Antes y ahora",
  "Antes, una cuenta podía estar cuatro días caída con las tres pantallas en verde, y al día once el aviso se " +
    "apagaba solo — no porque alguien lo hubiera arreglado, sino porque pasó el tiempo. Ahora aparece al segundo " +
    "día, en la primera pantalla, con los pasos adentro, y no se va hasta que la cuenta vuelve a entregar datos o " +
    "alguien declara que está apagada a propósito.",
  COLOR.frio,
  COLOR.borde,
);

recuadro(
  "Gracias por reportarlo",
  "El panel no se dio cuenta solo: la cuenta caída la encontró tu reclamo de que un producto mostraba una compra " +
    "cuando el administrador mostraba veintidós. Las dos alarmas que ahora existen y el aviso con los pasos " +
    "salieron de ahí. Si algo no cuadra, dilo igual aunque parezca un detalle - es más fácil descartar un reporte " +
    "que descubrir un dato faltante cuatro días después.",
  COLOR.bienFondo,
  "#cce9db",
);

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
