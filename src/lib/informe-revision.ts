import PDFDocument from "pdfkit";
import { db } from "@/lib/db";
import { calcularAlertasDiarias, type Alerta } from "@/lib/alertas-diarias";
import { encabezado, nota, pie, recuadro, seccion, tarjetas } from "@/lib/pdf-dibujo";

// El informe de "qué productos hay que mirar", para descargar.
//
// Existe porque la pantalla no siempre es el lugar. Quien decide sobre la
// pauta muchas veces no está frente al panel: está en una reunión, en el
// teléfono, o le pasa la lista a otra persona. Un PDF se manda por WhatsApp y
// se lee sin cuenta ni contraseña.
//
// No calcula nada nuevo: usa las MISMAS alertas que el panel muestra y que el
// reloj manda cada día. Si el informe dijera algo distinto de la pantalla,
// tendríamos dos verdades y ninguna serviría.

/** El orden en que se leen: primero lo que cuesta plata ahora. */
const ORDEN: Alerta["tipo"][] = ["apagar", "escalar", "revisar"];

const TITULO: Record<Alerta["tipo"], string> = {
  apagar: "Apagar o corregir",
  escalar: "Escalar",
  revisar: "Vigilar",
};

const TONO: Record<Alerta["tipo"], "mal" | "bien" | "neutro"> = {
  apagar: "mal",
  escalar: "bien",
  revisar: "neutro",
};

const EXPLICACION: Record<Alerta["tipo"], string> = {
  apagar: "Su costo por venta pasó el punto de equilibrio: cada compra que entra cuesta más de lo que deja.",
  escalar: "Su costo por venta está por debajo del equilibrio con holgura: aguanta más presupuesto sin dejar de ganar.",
  revisar: "Todavía gana, pero su costo por venta viene subiendo contra la semana anterior.",
};

export function nombreDelInformeDeRevision(fecha = new Date()) {
  const d = fecha.toISOString().slice(0, 10);
  return `productos-a-revisar-${d}.pdf`;
}

/**
 * Arma el PDF con los productos que piden una decisión.
 *
 * `verCifras` recorta el dinero, igual que en pantalla: el informe puede
 * terminar reenviado a alguien del equipo que no debería ver el CPA ni la
 * plata en juego, y un PDF no se puede recortar después de mandado.
 */
export async function construirInformeDeRevision(
  organizationId: string,
  verCifras: boolean,
): Promise<Buffer> {
  const [org, alertas] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    calcularAlertasDiarias(organizationId),
  ]);

  const hoy = new Date();
  const fechaLarga = hoy.toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });

  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
  const trozos: Buffer[] = [];
  doc.on("data", (c: Buffer) => trozos.push(c));
  const listo = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(trozos))));

  encabezado(doc, org?.name ?? "Importadora Bella", `Productos a revisar · ${fechaLarga}`);

  const porTipo = (t: Alerta["tipo"]) => alertas.filter((a) => a.tipo === t);
  const apagar = porTipo("apagar");
  const escalar = porTipo("escalar");
  const revisar = porTipo("revisar");

  tarjetas(doc, [
    { label: "Apagar o corregir", valor: String(apagar.length), nota: "pierden plata hoy", tono: apagar.length > 0 ? "mal" : "bien" },
    { label: "Escalar", valor: String(escalar.length), nota: "aguantan más presupuesto", tono: escalar.length > 0 ? "bien" : "neutro" },
    { label: "Vigilar", valor: String(revisar.length), nota: "el costo viene subiendo", tono: "neutro" },
    { label: "Ventana", valor: "7 días", nota: "la que usan las alertas" },
  ]);

  if (alertas.length === 0) {
    // El silencio también es información: sin decirlo, un informe vacío se lee
    // igual que un informe que no se pudo calcular.
    seccion(doc, "Nada que decidir hoy");
    recuadro(
      doc,
      "Ningún producto quedó fuera de su punto de equilibrio",
      [
        "Se revisaron todos los productos con pauta suficiente en los últimos 7 días.",
        "Ninguno pasó su costo de equilibrio ni muestra una subida que amerite mirarlo.",
      ],
      "bien",
    );
  }

  for (const tipo of ORDEN) {
    const grupo = porTipo(tipo);
    if (grupo.length === 0) continue;

    seccion(doc, TITULO[tipo]);
    recuadro(
      doc,
      `${grupo.length} ${grupo.length === 1 ? "producto" : "productos"}`,
      // Una línea por producto, con el porqué. El mensaje ya viene armado por
      // el mismo cálculo que alimenta la pantalla.
      grupo.map((a) => `${a.name} (${a.code}) — ${verCifras ? a.mensaje : a.mensajeSinCifras}`),
      TONO[tipo],
    );
    nota(doc, EXPLICACION[tipo]);
  }

  seccion(doc, "Cómo leer esto");
  nota(
    doc,
    "El punto de equilibrio de cada producto sale de su propia economía: precio, costo, flete, " +
      "efectividad de entrega y devoluciones. Por eso dos productos con el mismo costo por venta " +
      "pueden estar uno en verde y otro en rojo.",
  );
  if (!verCifras) {
    nota(doc, "Este informe se generó sin cifras de dinero, según el permiso de quien lo descargó.");
  }

  pie(doc, `Generado el ${fechaLarga} · Panel Jarvis`);
  doc.end();
  return listo;
}
