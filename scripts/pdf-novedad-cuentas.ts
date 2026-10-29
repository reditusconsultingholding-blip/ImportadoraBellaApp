/**
 * El informe de la novedad que reportó Emilia, para Emilia.
 *
 * Pedido de Sebastián el 29 de octubre: «dame el documento del reporte de la
 * novedad y lo que pasó en realidad y cómo solucionarlo para decirle a Emilia».
 *
 * NO ES EL INSTRUCTIVO. El otro documento —pdf-reconectar-cuenta.ts— dice qué
 * apretar en Windsor. Este dice QUÉ PASÓ: empieza por lo que ella reportó, con
 * sus palabras, y recién después explica. Un informe que arranca por el
 * diagnóstico obliga a quien reportó a buscar dónde quedó su reclamo, y la
 * primera reacción es pensar que no se lo tomaron en serio.
 *
 * TRES NOVEDADES, NO UNA. Ella reportó una sola cosa —«los números no cuadran»—
 * y abajo había tres causas distintas, que se arreglan en tres lugares
 * distintos y una de las cuales no hay que arreglar. Mezclarlas en una sola
 * explicación es lo que hace que un equipo deje de reportar.
 *
 * LO QUE NO SE SABE, SE PREGUNTA. De la tercera cuenta no se puede saber desde
 * los datos si es de WhatsApp o si el píxel está mal: el documento pregunta en
 * vez de suponer, y dice qué cambia con cada respuesta.
 *
 * CARACTERES QUE NO ENTRAN. pdfkit escribe en WinAnsi con las fuentes que trae,
 * y ahí no existen el signo menos matemático (U+2212) ni la flecha. Salen como
 * una comilla suelta, sin aviso. Guion normal y «>» en su lugar.
 *
 *   npx tsx scripts/pdf-novedad-cuentas.ts
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
  frio: "#f6f6f7",
};

type Novedad = {
  numero: string;
  titulo: string;
  /** Lo que reportó, con sus palabras. Es lo que lo hace reconocible. */
  reporte: string;
  cuando: string;
  realidad: string;
  /** Los números que lo prueban, para que no haya que creer. */
  prueba: string;
  solucion: string;
  estado: "RESUELTO" | "PENDIENTE" | "NO HAY NADA ROTO";
};

const NOVEDADES: Novedad[] = [
  {
    numero: "1",
    titulo: "Los números de una cuenta entera no llegaban al panel",
    cuando: "16 y 29 de octubre",
    reporte:
      "«¿Por qué gotas de drenaje linfático sale eso el día de hoy? Solo sale 1 compra.» Y después: «Ese problema de que no está cogiendo, justamente es de la cuenta 3. Me parece que no está conectada. Yo la reviso de Windsor: sí está conectado.»",
    realidad:
      "Tenías razón y el problema no era el producto: era la cuenta entera. Jarvis no le pregunta a Meta directamente — los números pasan por Windsor, y Windsor dejó de entregar los de esa cuenta. Por eso en Windsor se ve «conectada» y aun así no llega nada: una cosa es que la cuenta figure, y otra que esté entregando datos. Son dos estados distintos y el panel solo mostraba el primero. Las dos campañas de gotas que habían vendido 8 y 14 compras vivían justamente en la cuenta que no entregaba.",
    prueba:
      "CP1 - Top Ventas estuvo sin entregar un solo dato del 13 al 16 de octubre. Es la cuenta que más gasta: $437 el último día que entró, cerca de un tercio de todo el gasto de Meta. En esos días el panel mostró el gasto de Meta en $507 cuando venía en $1.550.",
    solucion:
      "CP1 - Top Ventas ya se reconectó y volvió a entrar completa — Windsor incluso recuperó los días perdidos, así que esos números ya están en el panel. Queda CP3 - Top Ventas, que se reconectó el 17, entregó tres días y se volvió a caer el 21. Es la que hay que reconectar ahora, con el paso a paso del otro documento.",
    estado: "PENDIENTE",
  },
  {
    numero: "2",
    titulo: "Una cuenta gasta todos los días y no registra ninguna compra",
    cuando: "Apareció el 21 de octubre - no estaba reportada",
    reporte:
      "Esta no la reportó nadie: salió al revisar cómo habían quedado las cuentas después de la primera reconexión.",
    realidad:
      "CP2 - Top Ventas sí entrega datos, así que no es el mismo problema. Lo suyo es que gasta y no registra ni una compra. Su gasto entra en el total de Meta y sus ventas no, así que el CPA general de la tienda sale peor del que es, y todas sus campañas aparecen entre las que van mal.",
    prueba:
      "$1.517 gastados en siete días, 31.025 clics y 0 compras registradas. Ocho días seguidos igual. Sus campañas llevan «WP» en el nombre.",
    solucion:
      "Acá hace falta que ustedes confirmen una cosa que desde los datos no se puede saber: si esas campañas son a WhatsApp. Si lo son, no hay nada roto — la venta se cierra en el chat y el píxel no tiene cómo verla — pero entonces ese gasto no se puede comparar con el de las demás y conviene dejarlo aparte en el panel. Si NO son de WhatsApp, hay que revisar el píxel de esa cuenta. Avísennos cuál de las dos es.",
    estado: "PENDIENTE",
  },
  {
    numero: "3",
    titulo: "El 20 % de pedidos que «el píxel no registra»",
    cuando: "16 y 29 de octubre",
    reporte:
      "«Vamos a 126 ventas, los píxeles de Meta y TikTok registran 101, que es el 80 %. Hay una diferencia de 25 pedidos, que es el 20 %. Ese 20 % el píxel no lo está agarrando. Ya se está repitiendo mucho ese detalle.»",
    realidad:
      "Acá la respuesta es distinta: ese 20 % no es un agujero, es el reloj. Un pedido entra en la tienda en el mismo momento en que se hace; la compra tarda en aparecer del lado de Meta y TikTok, porque el píxel la manda, la plataforma la atribuye y recién después Windsor la trae — hasta una hora más tarde. Por eso a media mañana la pauta va siempre por detrás de la tienda, y esa diferencia se cierra sola durante el día. Se repetía todos los días porque se estaba mirando todos los días a la misma hora.",
    prueba:
      "Los seis días cerrados anteriores, pedidos de la tienda contra compras atribuidas: 328/291, 336/320, 372/421, 321/271, 272/290 y 334/350. La diferencia final va de -16 % a +13 %, y en tres de esos seis días la pauta se atribuye MÁS ventas de las que entraron. No hay un 20 % que se pierda de forma sistemática.",
    solucion:
      "Para medir, comparar días cerrados y no el día en curso. El panel ahora lo avisa solo: cuando el período incluye hoy, aparece una línea que dice que el día todavía no cerró. Lo que sí hacía que faltaran ventas de verdad era la novedad 1, y esa se arregla reconectando.",
    estado: "NO HAY NADA ROTO",
  },
];

const CAMBIOS = [
  "El tablero se pone en ROJO cuando una cuenta que venía gastando deja de entregar datos, y dice cuál y desde cuándo. Antes solo avisaba si TODA la plataforma dejaba de responder: siete cuentas de diez era una respuesta válida y nadie se enteraba.",
  "También avisa cuando una cuenta gasta y no registra ninguna compra, que es la novedad 2. Esa alarma no existía.",
  "En Conexiones, cada cuenta dice de cuándo son sus últimos números. Antes todas decían «Conectada», que solo quería decir que alguien la dio de alta alguna vez — por eso en Windsor se veía bien y en el panel faltaban datos.",
  "El botón «Sincronizar ahora» de cada cuenta ahora funciona y contesta lo único que importa: si Windsor devolvió esa cuenta o si contestó bien pero sin ella.",
  "Cuando el período incluye el día de hoy, el bloque de ventas avisa que el día no cerró y recomienda comparar días cerrados.",
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "Jarvis_Novedad_cuentas_29-oct.pdf");
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

const TONO_ESTADO: Record<Novedad["estado"], [string, string]> = {
  RESUELTO: [COLOR.bien, COLOR.bienFondo],
  PENDIENTE: [COLOR.ojo, COLOR.ojoFondo],
  "NO HAY NADA ROTO": [COLOR.marca, COLOR.bienFondo],
};

/** Una novedad entera, medida antes de dibujarse para no partirla entre páginas. */
function ficha(n: Novedad) {
  const anchoTexto = ANCHO - 28;
  const bloques: [string, string][] = [
    ["LO QUE SE REPORTÓ", n.reporte],
    ["QUÉ ERA EN REALIDAD", n.realidad],
    ["CÓMO SE SABE", n.prueba],
    ["CÓMO SE SOLUCIONA", n.solucion],
  ];

  let alto = 34;
  for (const [, cuerpo] of bloques) {
    alto += 13 + doc.fontSize(9.5).heightOfString(cuerpo, { width: anchoTexto }) + 7;
  }
  alto += 10;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).fillAndStroke("#ffffff", COLOR.borde);

  // Título y chip de estado.
  const [tinta, fondo] = TONO_ESTADO[n.estado];
  const anchoChip = doc.fontSize(7.5).widthOfString(n.estado) + 14;
  doc.roundedRect(doc.page.width - 48 - 16 - anchoChip, y0 + 14, anchoChip, 14, 3).fill(fondo);
  doc
    .fillColor(tinta)
    .fontSize(7.5)
    .text(n.estado, doc.page.width - 48 - 16 - anchoChip, y0 + 18, { width: anchoChip, align: "center" });

  doc
    .fillColor(COLOR.marca)
    .fontSize(9)
    .text(`NOVEDAD ${n.numero} · ${n.cuando}`, 62, y0 + 13, { width: anchoTexto - anchoChip - 20 });
  doc.fillColor(COLOR.tinta).fontSize(11).text(n.titulo, 62, doc.y + 1, { width: anchoTexto - anchoChip - 20 });
  doc.moveDown(0.45);

  for (const [etiqueta, cuerpo] of bloques) {
    doc.fillColor(COLOR.suave).fontSize(7.5).text(etiqueta, 62, doc.y, { width: anchoTexto });
    doc.fillColor(COLOR.tinta).fontSize(9.5).text(cuerpo, 62, doc.y + 1.5, { width: anchoTexto });
    doc.moveDown(0.5);
  }

  doc.y = y0 + alto + 12;
}

/* -------------------------------- Portada -------------------------------- */

doc.fillColor(COLOR.marcaFuerte).fontSize(21).text("Lo que reportaste, qué era y cómo se arregla", 48, 56, {
  width: ANCHO,
});
doc
  .fillColor(COLOR.suave)
  .fontSize(11)
  .text("Importadora Bella - Jarvis - 29 de octubre de 2026", 48, doc.y + 6);
doc.moveDown(1.2);

recuadro(
  "En una línea",
  "Reportaste una cosa — «los números no cuadran» — y abajo había tres distintas. Una era un problema de verdad " +
    "y se arregla en Windsor; otra apareció después y necesita una respuesta de ustedes; y la tercera no es un " +
    "problema, es el reloj. Van una por una, con los números que lo prueban.",
  COLOR.frio,
  COLOR.borde,
);

/* ------------------------------ Las novedades ---------------------------- */

seccion("Las tres novedades", "Cada una se arregla en un lugar distinto, y una no hay que arreglarla.");
NOVEDADES.forEach(ficha);

/* --------------------------------- Qué sigue ----------------------------- */

seccion("Qué sigue, y de quién depende");

const PENDIENTES: [string, string][] = [
  [
    "Reconectar CP3 - Top Ventas en Windsor",
    "Con el paso a paso del documento «Volver a conectar una cuenta publicitaria». Al reconectar, marcar TODAS las cuentas y no solo esa: el 17 se reconectaron tres y esta se volvió a caer a los tres días, que es exactamente lo que pasa cuando la lista viene con unas pocas marcadas.",
  ],
  [
    "Decirnos si las campañas «WP» de CP2 - Top Ventas son a WhatsApp",
    "Con esa respuesta dejamos el panel contemplándolo: si son de WhatsApp, su gasto se separa para que no ensucie el CPA general; si no, se revisa el píxel de esa cuenta.",
  ],
  [
    "Para medir, mirar días cerrados",
    "El día en curso siempre va a mostrar menos compras atribuidas que pedidos reales, y no significa que falten ventas. El panel ya lo avisa.",
  ],
];

for (const [que, porque] of PENDIENTES) {
  const anchoTexto = ANCHO - 26;
  const alto = 14 + doc.fontSize(9.5).heightOfString(porque, { width: anchoTexto }) + 16;
  if (doc.y + alto > doc.page.height - 70) doc.addPage();
  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).fillAndStroke(COLOR.ojoFondo, "#f3dcae");
  doc.fillColor(COLOR.tinta).fontSize(10.3).text(que, 62, y0 + 11, { width: anchoTexto });
  doc.fillColor(COLOR.suave).fontSize(9.5).text(porque, 62, doc.y + 2, { width: anchoTexto });
  doc.y = y0 + alto + 10;
}

/* ----------------------------- Lo que cambió ----------------------------- */

seccion(
  "Lo que cambió para que no vuelva a pasar en silencio",
  "Lo peor de esto no fue que una cuenta se cayera: fue que estuvo cuatro días caída y las tres pantallas donde uno miraría decían que todo iba bien. Eso ya está corregido.",
);

doc.fillColor(COLOR.suave).fontSize(9.8);
for (const c of CAMBIOS) {
  const y = doc.y;
  if (y + 40 > doc.page.height - 70) doc.addPage();
  doc.circle(53, doc.y + 5, 2).fill(COLOR.marca);
  doc.fillColor(COLOR.suave).fontSize(9.8).text(c, 64, doc.y, { width: ANCHO - 16 });
  doc.moveDown(0.5);
}

doc.moveDown(0.6);
recuadro(
  "Gracias por reportarlo",
  "El panel no se dio cuenta solo: la cuenta caída la encontró tu reclamo de que un producto mostraba una compra " +
    "cuando el administrador mostraba veintidós. Las alarmas que se agregaron existen por ese reporte. Si algo no " +
    "cuadra, dilo igual aunque parezca un detalle — es más fácil descartar un reporte que descubrir un dato " +
    "faltante cuatro días después.",
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
