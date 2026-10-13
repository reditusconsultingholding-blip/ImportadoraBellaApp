/**
 * El informe de los ajustes del 13 de octubre, para el cliente.
 *
 * Pedido de Sebastián: "me das un pdf con el estado de lo realizado
 * completamente para decirle al cliente y que esté informado".
 *
 * REGLA DE ESTE DOCUMENTO: lo escrito acá se le muestra al dueño de la empresa,
 * así que cada cifra es una que se midió en la app en vivo y se puede volver a
 * mirar. Lo que todavía depende del equipo va en su propia sección y con
 * nombre: un informe que solo cuenta lo hecho deja al cliente creyendo que no
 * falta nada, y acá falta cargar datos que ningún programa puede inventar.
 *
 *   npx tsx scripts/pdf-estado-ajustes.ts
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

type Arreglo = {
  titulo: string;
  /** Lo que el equipo reportó, en sus palabras. Es lo que lo hace reconocible. */
  reporte?: string;
  /** Qué estaba pasando de verdad. */
  causa: string;
  /** Qué se hizo. */
  solucion: string;
  /** Cómo se comprobó que quedó. */
  prueba: string;
};

const ARREGLOS: Arreglo[] = [
  {
    titulo: "«Entre dos fechas» no aparecía",
    reporte:
      "Emilia: «en la parte del panel no aparece entre dos fechas, o sea como que aparece movido… se desaparecen las pestañitas».",
    causa:
      "Dos cosas distintas. En pantallas angostas los trece botones del selector miden 1.278 píxeles en una sola línea, y el bloque que los contiene tenía una regla que le impedía encogerse: los dos últimos —«Máximo» y «Entre dos fechas»— caían más allá del borde derecho y quedaban invisibles. Aparte, mientras una sección terminaba de cargar todos los botones quedaban bloqueados y casi ilegibles, así que apretar «Entre dos fechas» no hacía nada.",
    solucion:
      "Los botones ahora bajan a la línea siguiente cuando no entran. Y «Entre dos fechas» ya no se bloquea mientras carga: no cambia de período, abre una caja, y se puede abrir en cualquier momento.",
    prueba:
      "Comprobado en vivo a 958 píxeles de ancho en Panel y en Rentabilidad: los botones ocupan tres líneas, «Entre dos fechas» entra y abre sus dos campos de fecha.",
  },
  {
    titulo: "La utilidad daba pérdida en productos que sí venden",
    reporte:
      "Emilia: «en economía por producto me aparece mal la información aún… no cuadra con el archivo de mi compañera de administración».",
    causa:
      "El archivo que pasa administración viene a medias desde agosto: de las 33 filas de octubre, 16 tenían ÚNICAMENTE el costo de producción, con el precio y la efectividad en cero. Esos ceros se usaban como si fueran datos y le ganaban al precio real. Resultado: productos que se venden a 32,99 dólares se calculaban a cero, no generaban ningún ingreso y aparecían perdiendo el 100 % de la pauta. Catorce productos, 2.095 pedidos y 11.807 dólares de gasto contados como pérdida total.",
    solucion:
      "Una fila a medio llenar ya no borra lo que sí se sabe: el archivo del mes manda campo por campo, solo donde hay algo cargado. Un precio en cero no es un precio.",
    prueba:
      "Octubre pasó de 45.375 a 50.303 dólares de ingresos y de -4.009 (-9 %) a +390 (1 %) de utilidad, medido en la app en vivo.",
  },
  {
    titulo: "La economía ahora sale de la Calculadora de precios",
    reporte:
      "Emilia: «lo que nosotros queremos, para no tener esos inconvenientes, es que de calculadora mismo parta pues todo».",
    causa:
      "La utilidad dependía de un archivo que llega tarde —el 13 de octubre todavía iba hasta septiembre— mientras que la Calculadora la mantiene el equipo al día, con productos editados la misma mañana.",
    solucion:
      "En el mes que está corriendo manda la Calculadora de precios. Cuando el mes cierra, manda el archivo de administración. Los meses cerrados NO se recalculan con los precios de hoy: lo que se reportó de abril sigue siendo lo de abril, y eso fue a propósito — la Calculadora es un solo juego de números sin historia, y dejarla mandar sobre los meses viejos haría que un cierre cambiara cada vez que alguien ajusta un precio.",
    prueba:
      "Octubre quedó en 56.536 dólares de ingresos y +3.710 (7 %) de utilidad. Julio, que está cerrado, mantiene 45 de sus 51 productos tomados del archivo, sin cambios.",
  },
  {
    titulo: "Ahora se ve de dónde sale cada número",
    causa:
      "«Economía por producto» mostraba celdas vacías en los productos que el Control sí estaba calculando, y el pie de la pantalla afirmaba algo que había dejado de ser cierto. Quien abría la pantalla para revisar las cifras no tenía forma de saber qué estaba mirando.",
    solucion:
      "Cada fila muestra en gris el número que el Control está usando en ese momento y una etiqueta que dice de dónde sale: verde «Calculadora», naranja «Ficha vieja». Naranja significa que ese producto no está en la Calculadora ni tiene fila del mes, y se está calculando con números que pueden ser de hace meses. El pie de cada pantalla dice, según el mes que se mire, quién le gana a quién.",
    prueba:
      "Comprobado en octubre y en julio: la etiqueta y el número gris coinciden con lo que el Control calcula.",
  },
  {
    titulo: "Dos avisos que marcaban en rojo datos que estaban bien",
    causa:
      "Desde que la Calculadora entró en juego, el panel marcaba «economía estimada» en naranja sobre filas calculadas con ella —el dato más fresco que existe en la casa— y las contaba como «productos sin economía del mes». Un aviso de dato viejo sobre el dato nuevo enseña a ignorar los avisos.",
    solucion:
      "El naranja y el conteo quedan solo para los productos que de verdad siguen con la ficha del producto. El aviso ahora dice por qué caen ahí y lleva a la Calculadora, que es donde se arregla.",
    prueba: "Lo mismo se corrigió en «Origen de las ventas», que tenía el mismo aviso.",
  },
  {
    titulo: "Rentabilidad por producto y el Control ya dicen lo mismo",
    causa:
      "«Rentabilidad por producto» leía solo la ficha del producto —un juego de números para toda la historia, cargado a mano— mientras el Control publicitario ya usaba la Calculadora. Dos pantallas de la misma herramienta podían responder distinto sobre el mismo producto.",
    solucion:
      "Las dos salen ahora de la misma fuente. Abriendo una fila, la pantalla dice de qué mes y de qué origen salieron el precio, el costo y la efectividad con los que calculó.",
    prueba:
      "Para un período que cruza varios meses se usa la economía del mes en que termina el rango, y la pantalla lo dice.",
  },
  {
    titulo: "Ninguna sección se queda en blanco mientras carga",
    reporte: "Sebastián: «por qué se queda allí en blanco cuando está cargando, y feo».",
    causa:
      "Doce de las veintiuna secciones no tenían pantalla de carga: dejaban congelada la pantalla anterior, que es peor que el vacío porque parece que el clic no se registró. Las otras nueve mostraban bloques grises.",
    solucion:
      "Las veintiuna muestran ahora el logo de Bella con el aro girando, y debajo dicen qué está haciendo esa pantalla en particular: «se cuentan los pedidos reales contra lo que se gastó en pauta», «es año y medio de campañas puesto en una sola pantalla». Saber por qué tarda convierte la espera de sospecha en paciencia.",
    prueba: "Comprobado en vivo. Todo el movimiento se apaga para quien pide menos animaciones.",
  },
  {
    titulo: "El recorrido guiado cuenta todo esto, con voz",
    reporte:
      "Sebastián: «realízales el tour obligatorio y explícales todo esto; y si tienen preguntas, que te las puedes atender por chat».",
    causa:
      "El equipo ya había hecho el recorrido, así que lo que necesitaba no era que le explicaran el panel otra vez sino saber qué se movió.",
    solucion:
      "Dos pasos nuevos al principio: «Qué cambió esta semana» para todo el equipo, y uno sobre de dónde salen ahora los números de la utilidad para quienes ven cifras. Se corrigieron tres pasos que describían cosas que dejaron de ser ciertas. El cierre y el paso de Jarvis ahora dicen que se le puede preguntar por escrito o por voz, y que acepta imágenes.",
    prueba:
      "El recorrido quedó activado para las doce personas con acceso: les arranca solo al entrar. Los seis pasos nuevos se grabaron con la misma voz y el mismo modelo que los otros veintidós, para que no se note el corte.",
  },
];

type Pendiente = {
  que: string;
  porque: string;
  quien: string;
};

const PENDIENTES: Pendiente[] = [
  {
    que: "Cargar en la Calculadora de precios los 24 productos que siguen con la ficha vieja",
    porque:
      "Son los que la app marca en naranja. No están en la Calculadora ni tienen fila cargada en el mes, así que se calculan con números que pueden ser de hace meses. Ocho de ellos tienen pauta y pedidos reales pero ningún precio en ninguna parte, por lo que aparecen perdiendo todo lo que se gastó: ORANGE GEL EXFOLIANTE, Pulsera de cobre, Arbutin, PASTA DENTAL NANOHIDROXIAPATITA, COMBO CYPERUS + RASURADORA, KIT DE BATANA, Gotas Berberina y SOLUBRILLO.",
    quien: "Equipo de Importadora Bella",
  },
  {
    que: "Cargar el gasto administrativo de octubre",
    porque:
      "Sin ese número la utilidad de todo el mes sale más alta de lo real. Se carga en Control publicitario › Economía por producto.",
    quien: "Administración",
  },
  {
    que: "Enlazar 76 pedidos que no tienen producto asignado",
    porque:
      "Cuentan en el total de pedidos, pero sus ingresos no entran en la utilidad de ningún producto. Se resuelven en Control publicitario › Enlazar pedidos.",
    quien: "Equipo de Importadora Bella",
  },
  {
    que: "Corregir el encabezado de la pestaña OCTUBRE en la hoja de reporte de ventas",
    porque:
      "La columna del producto quedó escrita como «TOD» en vez de «PRODUCTO». Los datos entran igual porque la app lo resuelve por posición, pero el aviso rojo de sincronización no se apaga hasta corregirlo.",
    quien: "Equipo de Importadora Bella",
  },
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "Jarvis_Ajustes_13_octubre.pdf");
doc.pipe(fs.createWriteStream(salida));

const ANCHO = doc.page.width - 96;

/* ------------------------------- Dibujo ---------------------------------- */

function seccion(texto: string) {
  if (doc.y > doc.page.height - 170) doc.addPage();
  doc.moveDown(0.9);
  doc.fillColor(COLOR.tinta).fontSize(13.5).text(texto, 48, doc.y, { width: ANCHO });
  doc
    .moveTo(48, doc.y + 4)
    .lineTo(doc.page.width - 48, doc.y + 4)
    .lineWidth(0.5)
    .strokeColor(COLOR.borde)
    .stroke();
  doc.moveDown(0.8);
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

/**
 * La ficha de un arreglo.
 *
 * Se mide antes de dibujar para no partirla entre dos páginas: media ficha
 * arriba y media abajo es justo lo que hace que algo se lea mal.
 */
function ficha(a: Arreglo) {
  const anchoTexto = ANCHO - 28;
  let alto = 34;
  if (a.reporte) alto += doc.fontSize(9).heightOfString(a.reporte, { width: anchoTexto }) + 8;
  for (const [etiqueta, cuerpo] of [
    ["Qué pasaba", a.causa],
    ["Qué se hizo", a.solucion],
    ["Cómo se comprobó", a.prueba],
  ] as const) {
    alto += doc.fontSize(8).heightOfString(etiqueta, { width: anchoTexto });
    alto += doc.fontSize(9.5).heightOfString(cuerpo, { width: anchoTexto }) + 7;
  }
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).lineWidth(0.7).strokeColor(COLOR.borde).stroke();
  doc.fontSize(12).fillColor(COLOR.tinta).text(a.titulo, 62, y0 + 12, { width: anchoTexto });

  if (a.reporte) {
    // La cita del equipo va en su propio tono: es lo que hace que quien lee
    // reconozca el problema como suyo y no como una linea de un informe.
    doc.fontSize(9).fillColor(COLOR.marca).text(a.reporte, 62, doc.y + 5, { width: anchoTexto });
  }

  for (const [etiqueta, cuerpo] of [
    ["QUÉ PASABA", a.causa],
    ["QUÉ SE HIZO", a.solucion],
    ["CÓMO SE COMPROBÓ", a.prueba],
  ] as const) {
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
  doc
    .fillColor(COLOR.tinta)
    .fontSize(10.5)
    .text(`${n}. ${p.que}`, 62, y0 + 12, { width: anchoTexto });
  doc.fillColor(COLOR.suave).fontSize(9.5).text(p.porque, 62, doc.y + 3, { width: anchoTexto });
  doc.fillColor(COLOR.ojo).fontSize(8.5).text(`Lo hace: ${p.quien}`, 62, doc.y + 3, {
    width: anchoTexto,
  });
  doc.y = y0 + alto + 10;
}

/* ------------------------------- Portada -------------------------------- */
doc.rect(0, 0, doc.page.width, 110).fill(COLOR.marcaFuerte);
doc.fillColor("#ffffff").fontSize(23).text("Ajustes del 13 de octubre", 48, 32, { width: ANCHO });
doc
  .fillColor("#cfe9df")
  .fontSize(11)
  .text("Qué se arregló en Jarvis, cómo se comprobó, y qué queda pendiente del lado del equipo", 48, 64, {
    width: ANCHO,
  });
doc.fillColor(COLOR.tinta);
doc.y = 134;

doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text(
    `Importadora Bella · jarvisecom.com · ${new Date().toLocaleDateString("es-EC", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Guayaquil",
    })}`,
    48,
    doc.y,
    { width: ANCHO },
  );
doc.moveDown(1);

recuadro(
  "Lo más importante en una línea",
  "El Control publicitario estaba calculando con precios en cero para la mitad de los productos del mes, así que mostraba pérdidas donde no las había. " +
    "Octubre pasó de -4.009 dólares de utilidad a +3.710. Ninguna cifra de este documento es una estimación: todas se midieron en la aplicación en vivo y se pueden volver a mirar.",
  COLOR.bienFondo,
  COLOR.bienFondo,
);

/* -------------------------------- Antes y después ------------------------ */
seccion("Octubre, antes y después");

{
  const filas: [string, string, string, string][] = [
    ["", "Al empezar el día", "Tras el primer arreglo", "Como quedó"],
    ["Ingresos", "$45.375", "$50.303", "$56.536"],
    ["Utilidad", "-$4.009 (-9 %)", "+$390 (1 %)", "+$3.710 (7 %)"],
    ["Productos con gasto real e ingresos en cero", "14", "8", "8"],
  ];
  const anchos = [ANCHO * 0.37, ANCHO * 0.21, ANCHO * 0.21, ANCHO * 0.21];
  let y = doc.y;
  filas.forEach((fila, i) => {
    const alto = i === 0 ? 20 : 24;
    if (i === 0) doc.rect(48, y, ANCHO, alto).fill(COLOR.fondo);
    let x = 48;
    fila.forEach((celda, j) => {
      doc
        .fillColor(i === 0 ? COLOR.suave : j === 0 ? COLOR.tinta : COLOR.tinta)
        .fontSize(i === 0 ? 8 : 9.5)
        .text(celda, x + 10, y + (i === 0 ? 6 : 7), {
          width: anchos[j] - 14,
          align: j === 0 ? "left" : "right",
        });
      x += anchos[j];
    });
    y += alto;
    doc.moveTo(48, y).lineTo(doc.page.width - 48, y).lineWidth(0.5).strokeColor(COLOR.borde).stroke();
  });
  doc.y = y + 10;
  doc
    .fontSize(8.5)
    .fillColor(COLOR.suave)
    .text(
      "Los ocho productos que siguen en cero no tienen precio cargado en ningún lado: ni en la Calculadora, ni en el archivo del mes, ni en su ficha. Están listados al final.",
      48,
      doc.y,
      { width: ANCHO },
    );
  doc.moveDown(0.5);
}

/* ------------------------------ Lo que se arregló ------------------------ */
seccion("Lo que se arregló");
for (const a of ARREGLOS) ficha(a);

/* --------------------------------- Pendientes ---------------------------- */
seccion("Lo que queda, y no lo puede hacer el programa");
doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text(
    "Son datos que alguien tiene que cargar. La aplicación los avisa en pantalla, con el botón que lleva al lugar donde se resuelven.",
    48,
    doc.y,
    { width: ANCHO },
  );
doc.moveDown(0.8);
PENDIENTES.forEach((p, i) => pendiente(p, i + 1));

/* ----------------------------------- Soporte ----------------------------- */
seccion("Si al equipo le queda alguna duda");
recuadro(
  "Preguntarle a Jarvis, por escrito o por voz",
  "Dentro de la plataforma, en «Preguntarle a Jarvis», se le puede escribir o hablar por micrófono, y también mandarle una captura de pantalla para preguntar sobre ella. " +
    "Responde sobre los datos de la empresa y sobre cómo usar el panel. El recorrido guiado lo recuerda en su último paso, y el botón «Capacitación» del encabezado lo trae de vuelta cuando haga falta.",
  COLOR.fondo,
  COLOR.borde,
);

/* -------------------------------- Pie de página -------------------------- */
const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(
      `Importadora Bella · Jarvis · ${i + 1} de ${paginas.count}`,
      48,
      doc.page.height - 38,
      { width: ANCHO, align: "center", lineBreak: false },
    );
}

doc.end();
console.log("PDF escrito en", salida);
