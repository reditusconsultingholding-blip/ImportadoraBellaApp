/**
 * El inventario de lo que Jarvis paga para funcionar.
 *
 * Pedido de Sebastián: "generame un pdf de las suscripciones que estamos
 * pagando y usando para jarvis (…) dime las apps y qué planes tienen".
 *
 * REGLA DE ESTE DOCUMENTO: cada dato dice de dónde salió. Un papel de pagos con
 * una cifra inventada es peor que no tener papel, porque se cita en una reunión.
 * Lo verificado se marca como verificado, lo deducido dice de qué evidencia, y
 * lo que no se pudo confirmar aparece como pendiente — no se rellena.
 *
 *   npx tsx scripts/pdf-suscripciones.ts
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

type Estado = "verificado" | "deducido" | "pendiente";

type Servicio = {
  nombre: string;
  paraQue: string;
  plan: string;
  estado: Estado;
  comoSeSabe: string;
  cuenta?: string;
  donde: string;
};

/* Lo que la app usa de verdad. Sale de las variables de entorno que el código
   lee (ANTHROPIC_API_KEY, DATABASE_URL, WINDSOR_API_KEY, RESEND_API_KEY,
   RAILWAY_*), así que la lista no es de memoria: es lo que la app no puede
   arrancar sin ello. */
const SERVICIOS: Servicio[] = [
  {
    nombre: "Railway",
    paraQue: "El servidor donde vive la app. Si se apaga, jarvisecom.com no abre.",
    plan: "De pago — plan exacto por confirmar",
    estado: "pendiente",
    comoSeSabe:
      "La app está en línea y la prueba gratuita se agotó el 1 de octubre (ese día el sitio devolvió 404 hasta que se cargó el plan). El plan concreto no se pudo leer: la cuenta pide iniciar sesión.",
    cuenta: "dulcevb01@gmail.com (entra con GitHub)",
    donde: "railway.com › Workspace › Usage / Billing",
  },
  {
    nombre: "Supabase",
    paraQue: "La base de datos: pedidos, campañas, usuarios, todo el histórico.",
    plan: "Free",
    estado: "verificado",
    comoSeSabe:
      "Leído en la cuenta el 12 de octubre de 2026: la organización «Jarvis - Importadora Bella» figura en Free Plan con 1 proyecto.",
    donde: "supabase.com/dashboard › Organizations",
  },
  {
    nombre: "Anthropic (Claude)",
    paraQue: "La inteligencia de Jarvis: el chat, las recomendaciones y la voz.",
    plan: "Pago por uso (API) — no es una suscripción mensual fija",
    estado: "deducido",
    comoSeSabe:
      "La API se cobra por lo que se consume, no por un plan: no hay una cuota fija que renueve. El consumo del mes no se pudo leer porque la consola pide iniciar sesión.",
    donde: "platform.claude.com › Settings › Billing",
  },
  {
    nombre: "Windsor.ai",
    paraQue: "Trae el gasto y las campañas de Meta y TikTok. Sin esto no hay CPA.",
    plan: "Standard o Plus (no Professional)",
    estado: "deducido",
    comoSeSabe:
      "Lo dice el propio sistema. Jarvis pide siempre el refresco más corto primero: si el plan fuera Professional aceptaría 15 minutos. Windsor lo rechaza y acepta 1 hora, que es el mínimo de Standard y Plus. Medido el 12 de octubre en /api/frescura: intervalo de 60 minutos en Meta y en TikTok.",
    donde: "windsor.ai › cuenta › plan",
  },
  {
    nombre: "Name.com",
    paraQue: "El dominio jarvisecom.com y su DNS. También está jarvisecom.world.",
    plan: "Dominio, cobro anual",
    estado: "verificado",
    comoSeSabe:
      "jarvisecom.com se registró el 3 de septiembre de 2026 y vence el 3 de septiembre de 2027. El .world está estacionado, sin uso.",
    donde: "name.com › Domains",
  },
  {
    nombre: "Resend",
    paraQue: "Mandar los correos: reporte diario y avisos.",
    plan: "Sin uso hoy",
    estado: "verificado",
    comoSeSabe:
      "La clave no está cargada en la app, así que hoy no se está enviando ningún correo y no hay consumo. Tampoco hay registros DNS de Resend en los dominios, que es el paso previo para poder enviar.",
    donde: "resend.com › Settings › Billing",
  },
];

/* Lo que Jarvis usa pero NO paga Jarvis: son cuentas del negocio. Van aparte
   para que nadie las sume al costo de la herramienta. */
const DEL_NEGOCIO = [
  ["Shopify", "La tienda. Jarvis solo lee sus pedidos.", "Lo paga Importadora Bella por su tienda."],
  ["Notion", "El calendario de contenido del equipo.", "Cuenta del equipo de marketing."],
  ["Meta y TikTok Ads", "Las campañas. El gasto en pauta no es una suscripción.", "Es la inversión publicitaria del negocio."],
];

const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
const salida = path.join(process.cwd(), "Jarvis_Suscripciones.pdf");
doc.pipe(fs.createWriteStream(salida));

const ANCHO = doc.page.width - 96;

/* ------------------------------- Portada -------------------------------- */
doc.rect(0, 0, doc.page.width, 110).fill(COLOR.marcaFuerte);
doc.fillColor("#ffffff").fontSize(23).text("Suscripciones de Jarvis", 48, 32, { width: ANCHO });
doc
  .fillColor("#cfe9df")
  .fontSize(11)
  .text("Qué servicios paga la plataforma para funcionar, y en qué plan está cada uno", 48, 64, {
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

/* Cómo leer el documento. Va primero porque cambia cómo se lee todo lo demás. */
recuadro(
  "Cómo está hecho este documento",
  "La lista de servicios no es de memoria: sale de lo que la app necesita para arrancar. Cada plan dice de dónde se sabe. " +
    "Lo marcado como PENDIENTE no se pudo confirmar porque esas cuentas piden iniciar sesión y no se entra con contraseñas: " +
    "queda anotado dónde mirarlo, en vez de rellenarlo con una suposición.",
  COLOR.fondo,
  COLOR.borde,
);

/* ------------------------------ Los servicios ---------------------------- */
seccion("Lo que paga Jarvis");

for (const s of SERVICIOS) ficha(s);

/* ------------------------------ Lo del negocio --------------------------- */
seccion("Conectado, pero no lo paga Jarvis");
doc
  .fontSize(9.5)
  .fillColor(COLOR.suave)
  .text(
    "Jarvis se conecta a estas cuentas, que son del negocio. No son costo de la herramienta y no deberían sumarse acá.",
    48,
    doc.y,
    { width: ANCHO },
  );
doc.moveDown(0.6);

for (const [nombre, paraQue, dequien] of DEL_NEGOCIO) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  const y = doc.y;
  doc.fontSize(10.5).fillColor(COLOR.tinta).text(nombre, 48, y, { width: 140 });
  doc.fontSize(9.5).fillColor(COLOR.suave).text(paraQue, 192, y, { width: ANCHO - 144 });
  doc.fontSize(9).fillColor(COLOR.suave).text(dequien, 192, doc.y + 1, { width: ANCHO - 144 });
  doc.moveDown(0.7);
}

/* ------------------------------ Qué falta -------------------------------- */
seccion("Lo que falta confirmar");
recuadro(
  "Tres datos, en tres páginas",
  "1) Railway — qué plan está activo y cuánto cobra al mes (railway.com › Usage).\n" +
    "2) Anthropic — cuánto se consumió este mes (platform.claude.com › Billing).\n" +
    "3) Windsor.ai — si es Standard o Plus, y el monto (windsor.ai › plan).\n\n" +
    "Con esos tres números el cuadro queda cerrado. Se pueden cargar en la pantalla «Pagos y suscripciones» de Jarvis, " +
    "en el menú Números: ahí se anota cada servicio con su monto y su día de cobro, y la app avisa antes de cada uno.",
  COLOR.ojoFondo,
  "#f0d9a8",
);

/* --------------------------------- Pie ----------------------------------- */
const paginas = doc.bufferedPageRange();
for (let i = 0; i < paginas.count; i++) {
  doc.switchToPage(i);
  // El pie se dibuja debajo del margen inferior. Sin anular ese margen,
  // pdfkit considera que el texto no entra y agrega una página en blanco por
  // cada página del documento.
  const guardado = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc
    .fontSize(8)
    .fillColor(COLOR.suave)
    .text(
      `Jarvis · Reditus Consulting   ·   página ${i + 1} de ${paginas.count}`,
      48,
      doc.page.height - 34,
      { width: ANCHO, align: "center" },
    );
  doc.page.margins.bottom = guardado;
}

doc.end();
console.log("listo:", salida);

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

/** La ficha de un servicio: qué es, en qué plan está y de dónde se sabe. */
function ficha(s: Servicio) {
  // Se mide antes de dibujar para no partir una ficha entre dos páginas: media
  // ficha arriba y media abajo es justo lo que hace que un dato se lea mal.
  const altoComo = doc.heightOfString(s.comoSeSabe, { width: ANCHO - 28, fontSize: 9 } as never);
  const alto = 74 + altoComo + (s.cuenta ? 13 : 0);
  if (doc.y + alto > doc.page.height - 70) doc.addPage();

  const y0 = doc.y;
  doc.roundedRect(48, y0, ANCHO, alto, 6).lineWidth(0.7).strokeColor(COLOR.borde).stroke();

  doc.fontSize(12).fillColor(COLOR.tinta).text(s.nombre, 62, y0 + 12, { width: ANCHO - 170 });

  // La etiqueta de estado, a la derecha del nombre.
  const et = { verificado: "VERIFICADO", deducido: "DEDUCIDO", pendiente: "PENDIENTE" }[s.estado];
  const fondo = s.estado === "pendiente" ? COLOR.ojoFondo : COLOR.bienFondo;
  const tinta = s.estado === "pendiente" ? COLOR.ojo : COLOR.bien;
  const anchoEt = doc.fontSize(7.5).widthOfString(et) + 14;
  doc.roundedRect(doc.page.width - 48 - anchoEt, y0 + 13, anchoEt, 15, 7).fill(fondo);
  doc
    .fillColor(tinta)
    .fontSize(7.5)
    .text(et, doc.page.width - 48 - anchoEt, y0 + 17.5, { width: anchoEt, align: "center" });

  doc.fontSize(9.5).fillColor(COLOR.suave).text(s.paraQue, 62, y0 + 30, { width: ANCHO - 28 });

  doc.fontSize(10).fillColor(COLOR.marca).text(`Plan: ${s.plan}`, 62, doc.y + 4, {
    width: ANCHO - 28,
  });

  doc.fontSize(9).fillColor(COLOR.suave).text(s.comoSeSabe, 62, doc.y + 3, { width: ANCHO - 28 });

  if (s.cuenta) {
    doc.fontSize(8.5).fillColor(COLOR.suave).text(`Cuenta: ${s.cuenta}`, 62, doc.y + 2, {
      width: ANCHO - 28,
    });
  }
  doc.fontSize(8.5).fillColor(COLOR.suave).text(`Dónde se mira: ${s.donde}`, 62, doc.y + 2, {
    width: ANCHO - 28,
  });

  doc.y = y0 + alto + 10;
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
