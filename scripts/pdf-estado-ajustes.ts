/**
 * El informe de los ajustes del 13 de octubre, para el cliente.
 *
 * Pedido de Sebastián: «me das un pdf con el estado de lo realizado
 * completamente para decirle al cliente y que esté informado», y después «un
 * pdf actualizado de todas las actualizaciones y mejoras para darle
 * seguimiento».
 *
 * REGLA DE ESTE DOCUMENTO: lo escrito acá se le muestra al dueño de la empresa,
 * así que cada cifra es una que se midió en la app en vivo y se puede volver a
 * mirar. Lo que todavía depende del equipo va en su propia sección y con
 * nombre: un informe que solo cuenta lo hecho deja al cliente creyendo que no
 * falta nada, y acá falta cargar datos que ningún programa puede inventar.
 *
 * ESTÁ ORDENADO POR LO QUE LE IMPORTA AL CLIENTE, NO POR CÓMO SE HIZO. Primero
 * la plata —los números que estaban mal—, después lo que la app vigila sola, y
 * al final lo que se ve y se usa. Por orden cronológico habría que leerlo
 * entero para encontrar lo que a uno le toca.
 *
 * CARACTERES QUE NO ENTRAN. pdfkit escribe en WinAnsi con las fuentes que trae,
 * y ahi no existen el signo menos matematico (U+2212) ni la flecha. Salen como
 * una comilla suelta, sin aviso ninguno. Para los numeros negativos va el guion
 * de siempre y para las flechas el simbolo de mayor que.
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
  causa?: string;
  solucion: string;
  prueba: string;
};

/* --------------------------------- 1. La plata --------------------------- */

const PLATA: Arreglo[] = [
  {
    titulo: "La utilidad daba pérdida en productos que sí venden",
    reporte:
      "Emilia: «en economía por producto me aparece mal la información aún… no cuadra con el archivo de mi compañera de administración».",
    causa:
      "El archivo que pasa administración viene a medias desde agosto: de las 33 filas de octubre, 16 tenían ÚNICAMENTE el costo de producción, con el precio y la efectividad en cero. Esos ceros se usaban como si fueran datos y le ganaban al precio real. Productos que se venden a 32,99 dólares se calculaban a cero, no generaban ningún ingreso y aparecían perdiendo el 100 % de la pauta: catorce productos, 2.095 pedidos y 11.807 dólares de gasto contados como pérdida total.",
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
    titulo: "El flete y el costo se cobraban por unidad, no por paquete",
    causa:
      "La economía está expresada POR PEDIDO, que es como la lee el equipo: Gotas de drenaje es «32,99 el precio, 8,25 el producto, 6,24 el flete», y esos 32,99 son lo que paga un cliente por su pedido —un pack de tres— no por un frasco. Pero «Rentabilidad por producto» los aplicaba por unidad. En esta tienda se venden 3,17 unidades por pedido, así que el costo y el envío venían inflados más de tres veces. Con las fichas vacías no se notaba: sin costo cargado, cualquier multiplicador da cero.",
    solucion:
      "Los dos pasan a ir por paquete. El ingreso no se tocó: ese sí es correcto sobre unidades, porque sale de lo que la tienda facturó de verdad.",
    prueba:
      "La utilidad estimada pasó de -58.712 a +34.266 dólares, y los productos en pérdida de 21 a 15. Las 3,17 unidades por pedido se midieron sobre los últimos treinta días.",
  },
  {
    titulo: "Rentabilidad y el Control ya dicen lo mismo",
    causa:
      "«Rentabilidad por producto» leía solo la ficha del producto —un juego de números para toda la historia, cargado a mano— mientras el Control publicitario ya usaba la Calculadora. Dos pantallas de la misma herramienta podían responder distinto sobre el mismo producto.",
    solucion:
      "Las dos salen ahora de la misma fuente. Abriendo una fila, la pantalla dice de qué mes y de qué origen salieron el precio, el costo y la efectividad con los que calculó.",
    prueba:
      "Para un período que cruza varios meses se usa la economía del mes en que termina el rango, y la pantalla lo dice.",
  },
  {
    titulo: "Ahora se ve de dónde sale cada número",
    causa:
      "«Economía por producto» mostraba celdas vacías en los productos que el Control sí estaba calculando, y el pie de la pantalla afirmaba algo que había dejado de ser cierto.",
    solucion:
      "Cada fila muestra en gris el número que el Control está usando y una etiqueta con su origen: verde «Calculadora», naranja «Ficha vieja». Naranja significa que ese producto no está en la Calculadora ni tiene fila del mes, y se calcula con números que pueden ser de hace meses.",
    prueba:
      "Comprobado en octubre y en julio: la etiqueta y el número gris coinciden con lo que el Control calcula.",
  },
];

/* ------------------------- 2. Lo que la app vigila ----------------------- */

const VIGILANCIA: Arreglo[] = [
  {
    titulo: "El reporte de ventas llevaba dos días sin entrar, y nadie lo sabía",
    causa:
      "La sincronización reventaba con «value 593993729281 is out of range for type integer»: un teléfono de Ecuador entrando por la columna de unidades, porque al correrse los encabezados de la planilla el mapeo de columnas se desplazó. Lo caro no era el dato malo sino que tumbaba la escritura COMPLETA — no entraba ni una fila por culpa de un celular — y el error venía de la base de datos al final de todo, con un número y ninguna pista de qué fila ni qué columna.",
    solucion:
      "Mil unidades en un pedido ya es absurdo para esta tienda, así que lo que pase de ahí se descarta: el pedido se cuenta igual con cero unidades, porque los pedidos son lo que usa el Control. El aviso dice qué número apareció, que es lo único que permite encontrar la columna.",
    prueba:
      "Al forzar la lectura entraron 361 filas de 12 días de octubre y la fuente pasó de rojo a verde. Octubre quedó con 5.258 pedidos cargados.",
  },
  {
    titulo: "Tres fuentes cuyo estado no coincidía con la realidad",
    causa:
      "El reporte de ventas figuraba en rojo sobre una planilla que entraba completa, porque mezclaba «no se pudo leer esta pestaña» con «el encabezado está mal escrito pero lo leí igual por posición». El correo figuraba en «ok» con un detalle que empezaba por «error: Falta la clave de Resend», así que llevaba semanas apareciendo sano sin poder mandar un solo reporte. Y los dos relojes metían sus errores en el texto y anotaban la vuelta como buena — el lento escribía siempre la misma frase, que decía lo mismo un día perfecto que un día en que Notion no respondió.",
    solucion:
      "El rojo queda solo para cuando falta el dato; lo que está mal pero no impidió leer va en el detalle. El estado de cada fuente se decide mirando lo que la propia vuelta reportó, y no confiando en que cada parte se acuerde de avisar.",
    prueba:
      "El correo ya figura en rojo con su mensaje, y el reporte de ventas en verde con los avisos en el detalle. Tres pruebas automáticas cuidan que «sin errores» y «0 errores» no se confundan con una falla.",
  },
  {
    titulo: "El borrado de tareas de Notion era mudo",
    reporte:
      "Sebastián: «que no esté generando errores de eliminaciones de tareas de Notion y demás».",
    causa:
      "El import no quita más de un tercio de las tareas de la ventana —si de golpe sobra la mitad, lo que falló fue la lectura, no es que el equipo haya vaciado Notion— pero cuando ese freno actuaba no lo decía: el reporte marcaba «0 quitadas», igual que un día sin nada que borrar. Nadie podía enterarse de que quedaban tareas fantasma. Y el tercio solo tiene sentido sobre un montón: con cuatro tareas en la ventana, borrar dos ya estaba frenado, así que esas dos se quedaban para siempre.",
    solucion:
      "Ahora el freno avisa cuántas no se quitaron y por qué, y hasta tres se borran igual: nadie borra tres por accidente y no puede ser una lectura rota.",
    prueba: "Queda escrito en el detalle de la fuente, donde el equipo ya mira el estado de las sincronizaciones.",
  },
  {
    titulo: "El botón «Traer la planilla ahora» no contaba nada",
    causa:
      "Hace el mismo trabajo que el reloj pero era mudo: una pestaña ilegible salía por ahí como «Sin cambios desde la última vez» y el estado de la fuente quedaba igual. Alguien podía arreglar el encabezado en la hoja, apretar el botón, ver que decía que todo bien, y la fuente seguía en rojo horas.",
    solucion: "Ahora anota la vuelta igual que el reloj y devuelve lo que encontró.",
    prueba: "Probado en vivo: devolvió las 361 filas y los dos avisos de la pestaña de octubre.",
  },
  {
    titulo: "Dos avisos que marcaban en rojo datos que estaban bien",
    causa:
      "Desde que la Calculadora entró en juego, el panel marcaba «economía estimada» en naranja sobre filas calculadas con ella —el dato más fresco que existe en la casa— y las contaba como «productos sin economía del mes». Un aviso de dato viejo sobre el dato nuevo enseña a ignorar los avisos.",
    solucion:
      "El naranja y el conteo quedan solo para los productos que siguen con la ficha. El aviso dice por qué caen ahí y lleva a la Calculadora, que es donde se arregla.",
    prueba: "Lo mismo se corrigió en «Origen de las ventas», que tenía el mismo aviso.",
  },
];

/* ------------------------- 3. Lo que se ve y se usa ---------------------- */

const PANTALLA: Arreglo[] = [
  {
    titulo: "«Entre dos fechas» no aparecía",
    reporte:
      "Emilia: «en la parte del panel no aparece entre dos fechas, o sea como que aparece movido… se desaparecen las pestañitas».",
    causa:
      "En pantallas angostas los trece botones del selector miden 1.278 píxeles en una sola línea y el bloque que los contiene no podía encogerse: los dos últimos caían más allá del borde y quedaban invisibles. Aparte, mientras una sección terminaba de cargar todos los botones quedaban bloqueados y casi ilegibles, así que apretar no hacía nada.",
    solucion:
      "Los botones bajan a la línea siguiente cuando no entran, y «Entre dos fechas» ya no se bloquea mientras carga: no cambia de período, abre una caja.",
    prueba:
      "Comprobado a 958 píxeles de ancho en Panel y en Rentabilidad: ocupan tres líneas y «Entre dos fechas» abre sus dos campos.",
  },
  {
    titulo: "Ninguna sección se queda en blanco mientras carga",
    reporte: "Sebastián: «por qué se queda allí en blanco cuando está cargando, y feo».",
    causa:
      "Doce de las veintiuna secciones no tenían pantalla de carga: dejaban congelada la pantalla anterior, que es peor que el vacío porque parece que el clic no se registró. Las otras nueve mostraban bloques grises.",
    solucion:
      "Las veintiuna muestran la marca con el aro girando, y debajo dicen qué está haciendo esa pantalla en particular: «se cuentan los pedidos reales contra lo que se gastó en pauta», «es año y medio de campañas puesto en una sola pantalla».",
    prueba: "Comprobado en vivo. Todo el movimiento se apaga para quien pide menos animaciones.",
  },
  {
    titulo: "Una pieza propia para cada sección",
    causa:
      "Veintiuna secciones compartían once dibujos de línea: «Panel», «Estadísticas CEO» y «Origen de las ventas» se veían iguales en el menú.",
    solucion:
      "Veintiuna piezas nuevas, una por sección, con el verde de la marca y el objeto en blanco. Van en el menú y en el encabezado de cada pantalla, con realce al pasar el cursor y un latido en la sección donde uno está parado. Sobre el verde oscuro llevan un chip claro detrás, porque sin él el cuadro se fundía con el fondo y el objeto quedaba flotando.",
    prueba:
      "Las veintiuna viajan en una sola imagen de 37 KB. Antes eran veintiún archivos y veintiuna peticiones: la última llegaba después de que la pantalla estuviera armada, y por eso los cuadros se veían un momento en blanco. Medido en vivo: ahora llegan 308 milisegundos antes de que la pantalla esté lista, así que no hay momento en blanco que ver.",
  },
  {
    titulo: "La barra lateral se esconde del todo, y el verde dejó de ser un rectángulo",
    reporte:
      "Sebastián: «que deje esconder la barra de la izquierda», «ese verde se ve muy estático» y «cuando se esconde, que no aparezcan las herramientas».",
    causa:
      "En un portátil, 240 píxeles de menú contra una tabla de nueve columnas es mucho. La primera versión dejaba una columna de 68 píxeles con las piezas a la vista; esa franja de íconos sin texto se veía peor que el menú entero. Y la barra era un bloque de color plano del alto de la pantalla: el más grande de la app y el único sin nada adentro.",
    solucion:
      "Plegada no queda nada: la barra se va a cero y el trabajo ocupa el ancho completo. Queda solo el tirador contra el borde, que la trae de vuelta. La preferencia se recuerda. El verde lleva ahora el mismo resplandor que respira del encabezado y un filo claro en el borde derecho.",
    prueba:
      "Medido en vivo: 240 píxeles abierta, 0 plegada, sin un solo ícono asomando. Vuelve a abrirse desde el tirador.",
  },
  {
    titulo: "El arranque del día",
    reporte:
      "Sebastián: «cada inicio de día que les dé una frase motivacional en un pop-up, y cuando presionen les diga ¿Estás listo? y comience un conteo regresivo de 5 a 1. Los detalles alegran el alma con buenas interfaces».",
    solucion:
      "Una vez por jornada, marcada con la fecha de Ecuador: quien entra a las 7 y vuelve a las 11 no lo ve dos veces. Son 21 frases escritas para este negocio —pauta que se revisa a primera hora, pedidos que se confirman, creativos que se caen— mezcladas con clásicos, y la del día sale de la fecha, así que todo el equipo comparte la misma cada mañana. No bloquea: se sale con Escape, con «Saltar» o esperando la cuenta.",
    prueba: "Probado de punta a punta: la cuenta corre, cierra sola y guarda la fecha.",
  },
  {
    titulo: "Los botones de arriba, y las tarjetas del panel",
    reporte: "Sebastián: «los botones se ven grises y se pierden, deben resaltar un poco más».",
    causa:
      "El selector de tema marcaba el elegido con un gris casi blanco sobre blanco: no se distinguía del no elegido. Y las cinco tarjetas del panel aparecían de golpe, sin jerarquía.",
    solucion:
      "El elegido usa ahora el mismo verde de selección que el resto de la app, y «Capacitación» tiene superficie propia. Las tarjetas entran en cascada —45 milisegundos entre cada una, para que el ojo las lea en orden— se realzan al pasar el cursor, y late solo la de Ventas, que es la única que cambia sola mientras alguien mira.",
    prueba: "Verificado en la app: las cinco con su lugar en la cascada, una sola con latido.",
  },
  {
    titulo: "El aviso de Meta y TikTok se abre al pasar el cursor",
    reporte: "Sebastián: «este apartado que se vea más tecnológico: arriba el encabezado, y esta notificación al pararse sobre este».",
    causa:
      "Decir de cuándo son los datos es información de consulta, no una acción, y estaba detrás de un clic. Lo que se mira de reojo y pide un clic no lo mira nadie.",
    solucion:
      "Se abre al pasar el cursor y se queda si se aprieta, para poder leerlo con calma; con teclado se abre al llegar. Adentro, cada plataforma tiene su cuenta regresiva y un riel que muestra cuánto del intervalo ya transcurrió: «faltan 35 minutos» se entiende de un vistazo en vez de leerse.",
    prueba:
      "Comprobado en vivo con los números de la tarde: Meta a 40 % del riel con 35:44 por delante, TikTok a 7 % con 56:04. Los dos coinciden con el reloj de Windsor.",
  },
  {
    titulo: "El panel de notificaciones, y la firma que se descifra",
    reporte:
      "Sebastián: «aquí también por favor más tecnológico», y «que el by Reditus Developers al cargar aparezca como en un formato tipo encriptado y pum aparezca, un efecto élite una vez al día».",
    causa:
      "El panel de la campana era una tarjeta blanca con bordes grises: la única pieza de la app que seguía pareciendo un formulario. Y con mil notificaciones sin leer, «Marcar todo leído» quedaba a mil filas de distancia.",
    solucion:
      "Panel oscuro con la misma rejilla del arranque del día, el filo de color del nivel pegado a cada fila, y el encabezado y el pie fijos: el contador y «Marcar todo leído» se quedan arriba por mucho que se baje. La firma del pie del menú se descifra letra por letra la primera vez que alguien entra cada día — una vez, porque un efecto en cada carga deja de ser un saludo y se vuelve un peaje.",
    prueba:
      "Comprobado en vivo con 1.110 notificaciones sin leer: el encabezado no se despega y los tres niveles se leen sobre el fondo oscuro.",
  },
  {
    titulo: "El recorrido guiado cuenta todo esto, con voz",
    reporte:
      "Sebastián: «realízales el tour obligatorio y explícales todo esto; y si tienen preguntas, que se las puedes atender por chat».",
    causa:
      "El equipo ya había hecho el recorrido: lo que necesitaba no era que le explicaran el panel otra vez sino saber qué se movió.",
    solucion:
      "Dos pasos nuevos al principio: «Qué cambió esta semana» para todos, y uno sobre de dónde salen ahora los números de la utilidad para quienes ven cifras. Se corrigieron tres pasos que describían cosas que dejaron de ser ciertas. El cierre y el paso de Jarvis dicen que se le puede preguntar por escrito o por voz, y que acepta imágenes.",
    prueba:
      "Activado para las doce personas con acceso: les arranca solo al entrar. Los seis pasos nuevos se grabaron con la misma voz que los otros veintidós.",
  },
  {
    titulo: "Dar de alta a alguien del equipo",
    reporte: "Sebastián: «que sea fácil agregar más usuarios y demás».",
    causa:
      "Había que inventar una contraseña en el momento, con el formulario abierto y alguien esperando — de ahí sale siempre la misma familia, el nombre de la empresa con un número — y después el formulario se cerraba y la contraseña se perdía.",
    solucion:
      "Un botón genera una clave de 24 caracteres sin las letras que se confunden al dictar, en grupos de seis. Al crear la cuenta, el correo y la clave quedan a la vista con un botón que los copia listos para pegar en el chat. No se guardan en ningún lado: viven en esa pantalla y en ese momento.",
    prueba:
      "Dos pruebas automáticas: que no repita, que no use caracteres ambiguos, y que reparta parejo el alfabeto.",
  },
];

type Pendiente = { que: string; porque: string; quien: string };

const PENDIENTES: Pendiente[] = [
  {
    que: "Corregir el encabezado de la pestaña OCTUBRE en la hoja de reporte de ventas",
    porque:
      "La columna del producto quedó escrita como «TOD» en vez de «PRODUCTO». Es lo que corrió las columnas y metió un teléfono donde van las unidades, que es lo que tuvo la planilla dos días sin entrar. La aplicación ahora lo resuelve sola, pero mientras el encabezado siga mal el riesgo vuelve con cualquier columna nueva.",
    quien: "Equipo de Importadora Bella",
  },
  {
    que: "Cargar en la Calculadora de precios los 24 productos que siguen con la ficha vieja",
    porque:
      "Son los que la aplicación marca en naranja. Nueve de ellos tienen pauta y pedidos reales pero ningún precio en ninguna parte, así que aparecen perdiendo todo lo que se gastó.",
    quien: "Equipo de Importadora Bella",
  },
  {
    que: "Cargar el gasto administrativo de octubre",
    porque:
      "Sin ese número la utilidad de todo el mes sale más alta de lo real. Se carga en Control publicitario › Economía por producto.",
    quien: "Administración",
  },
  {
    que: "Pegar la clave de Resend",
    porque:
      "Sin ella la plataforma no puede enviar ni un correo: ni reportes diarios ni avisos. Figuraba como sana por un error que ya se corrigió; ahora la aplicación lo marca en rojo. Se pega en Conexiones › Correo saliente.",
    quien: "Equipo de Importadora Bella",
  },
  {
    que: "Enlazar 76 pedidos que no tienen producto asignado",
    porque:
      "Cuentan en el total de pedidos, pero sus ingresos no entran en la utilidad de ningún producto. Se resuelven en Control publicitario › Enlazar pedidos.",
    quien: "Equipo de Importadora Bella",
  },
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "Jarvis_Ajustes_13_octubre.pdf");
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

/**
 * La ficha de un arreglo.
 *
 * Se mide antes de dibujar para no partirla entre dos páginas: media ficha
 * arriba y media abajo es justo lo que hace que algo se lea mal.
 */
function ficha(a: Arreglo) {
  const anchoTexto = ANCHO - 28;
  const bloques: [string, string][] = [];
  if (a.causa) bloques.push(["QUÉ PASABA", a.causa]);
  bloques.push(["QUÉ SE HIZO", a.solucion]);
  bloques.push(["CÓMO SE COMPROBÓ", a.prueba]);

  let alto = 34;
  if (a.reporte) alto += doc.fontSize(9).heightOfString(a.reporte, { width: anchoTexto }) + 8;
  for (const [etiqueta, cuerpo] of bloques) {
    alto += doc.fontSize(8).heightOfString(etiqueta, { width: anchoTexto });
    alto += doc.fontSize(9.5).heightOfString(cuerpo, { width: anchoTexto }) + 7;
  }
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).lineWidth(0.7).strokeColor(COLOR.borde).stroke();
  doc.fontSize(12).fillColor(COLOR.tinta).text(a.titulo, 62, y0 + 12, { width: anchoTexto });

  if (a.reporte) {
    // La cita del equipo va en su propio tono: es lo que hace que quien lee
    // reconozca el problema como suyo y no como una línea de un informe.
    doc.fontSize(9).fillColor(COLOR.marca).text(a.reporte, 62, doc.y + 5, { width: anchoTexto });
  }

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
  .text(
    "Qué se arregló en Jarvis, cómo se comprobó, y qué queda pendiente del lado del equipo",
    48,
    64,
    { width: ANCHO },
  );
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
  "Lo más importante en tres líneas",
  "El Control publicitario calculaba con precios en cero para la mitad de los productos del mes, así que mostraba pérdidas donde no las había: octubre pasó de -4.009 dólares de utilidad a +3.710. " +
    "En Rentabilidad, el flete y el costo se cobraban por unidad en vez de por paquete, y con 3,17 unidades por pedido eso triplicaba los costos: pasó de -58.712 a +34.266. " +
    "Y el reporte de ventas llevaba dos días sin entrar sin que nadie lo supiera, por un teléfono que caía en la columna de unidades. Ninguna cifra de este documento es una estimación: todas se midieron en la aplicación en vivo.",
  COLOR.bienFondo,
  COLOR.bienFondo,
);

/* ---------------------------- Antes y después ---------------------------- */
seccion("Los números, antes y después");

{
  const filas: [string, string, string][] = [
    ["", "Antes", "Ahora"],
    ["Octubre · ingresos", "$45.375", "$56.536"],
    ["Octubre · utilidad", "-$4.009 (-9 %)", "+$3.710 (7 %)"],
    ["Rentabilidad · utilidad estimada", "-$58.712", "+$34.266"],
    ["Productos en pérdida", "21", "15"],
    ["Productos con gasto real e ingresos en cero", "14", "8"],
  ];
  const anchos = [ANCHO * 0.5, ANCHO * 0.25, ANCHO * 0.25];
  let y = doc.y;
  filas.forEach((fila, i) => {
    const alto = i === 0 ? 20 : 23;
    if (i === 0) doc.rect(48, y, ANCHO, alto).fill(COLOR.fondo);
    let x = 48;
    fila.forEach((celda, j) => {
      doc
        .fillColor(i === 0 ? COLOR.suave : j === 2 ? COLOR.bien : COLOR.tinta)
        .fontSize(i === 0 ? 8 : 9.5)
        .text(celda, x + 10, y + (i === 0 ? 6 : 7), {
          width: anchos[j] - 14,
          align: j === 0 ? "left" : "right",
        });
      x += anchos[j];
    });
    y += alto;
    doc
      .moveTo(48, y)
      .lineTo(doc.page.width - 48, y)
      .lineWidth(0.5)
      .strokeColor(COLOR.borde)
      .stroke();
  });
  doc.y = y + 10;
  doc
    .fontSize(8.5)
    .fillColor(COLOR.suave)
    .text(
      "Los ocho productos que siguen en cero no tienen precio cargado en ningún lado: ni en la Calculadora, ni en el archivo del mes, ni en su ficha. Están en la lista de pendientes, al final.",
      48,
      doc.y,
      { width: ANCHO },
    );
  doc.moveDown(0.4);
}

/* ------------------------------ Las secciones ---------------------------- */
seccion("1 · La plata", "Los números que estaban mal, por qué, y cuánto cambiaron.");
for (const a of PLATA) ficha(a);

seccion(
  "2 · Lo que la aplicación vigila sola",
  "Avisos que mentían y fallas que no se veían. Es la parte que evita que un problema pase dos días sin que nadie se entere.",
);
for (const a of VIGILANCIA) ficha(a);

seccion("3 · Lo que se ve y se usa", "Lo que el equipo reportó de la pantalla, y lo que se sumó.");
for (const a of PANTALLA) ficha(a);

/* --------------------------------- Pendientes ---------------------------- */
seccion(
  "Lo que queda, y no lo puede hacer el programa",
  "Son datos que alguien tiene que cargar o corregir. La aplicación los avisa en pantalla, con el botón que lleva al lugar donde se resuelven.",
);
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
  // El pie va por debajo del margen inferior, y para pdfkit eso significa «no
  // entra»: sin bajarle el margen agrega una página por cada pie.
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(`Importadora Bella · Jarvis · ${i + 1} de ${paginas.count}`, 48, doc.page.height - 38, {
      width: ANCHO,
      align: "center",
      lineBreak: false,
    });
}

doc.end();
console.log("PDF escrito en", salida);
