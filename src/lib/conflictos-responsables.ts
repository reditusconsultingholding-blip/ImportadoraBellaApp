import { db } from "@/lib/db";
import { avisarAVarios } from "@/lib/push";

/**
 * Los choques entre PRODUCTOS ORDEN de Notion y lo que hay en Jarvis.
 *
 * La sincronización decidía sola —y decidía Notion— sin que nadie se enterara.
 * Así se perdió tres veces el acceso de la integrante nueva: Emilia la asignaba,
 * la pasada siguiente la borraba, y el único síntoma visible era que la persona
 * dejaba de poder editar. Nadie conectaba una cosa con la otra.
 *
 * Ahora la app no elige. Anota el choque, le avisa a dirección y espera. Y
 * MIENTRAS NADIE DECIDE NO TOCA NADA: dejar a alguien con un acceso de más se
 * ve y se corrige; quitárselo en silencio es justo lo que venía pasando.
 */

export type ChoqueDetectado =
  | { tipo: "sobra_en_jarvis"; productId: string; userId: string }
  | { tipo: "sin_cruzar"; productId: string; nombreEnNotion: string };

/** Las decisiones que puede tomar dirección. */
export const DECISIONES = ["dejar", "quitar", "asignar", "ignorar"] as const;
export type Decision = (typeof DECISIONES)[number];

/**
 * La huella de un choque.
 *
 * Dos pasadas seguidas ven el mismo choque, y preguntar cada diez minutos lo
 * mismo es la forma más rápida de que dejen de mirar las notificaciones. La
 * clave hace que el segundo encuentro solo toque `vistoEn`.
 *
 * El nombre de Notion se normaliza —mayúsculas y espacios— porque "ANITA" y
 * "Anita " son el mismo problema escrito de dos formas, y si no, cada arreglo
 * cosmético en la planilla abriría un choque nuevo.
 */
export function claveDe(c: ChoqueDetectado) {
  return c.tipo === "sobra_en_jarvis"
    ? `sobra_en_jarvis|${c.productId}|${c.userId}`
    : `sin_cruzar|${c.productId}|${c.nombreEnNotion.trim().toUpperCase().replace(/\s+/g, " ")}`;
}

/**
 * Registra lo encontrado en una pasada y avisa de lo nuevo.
 *
 * Devuelve cuántos choques se abrieron por primera vez: es lo único que amerita
 * una notificación. Los que ya estaban se tocan en silencio.
 */
export async function registrarChoques(organizationId: string, choques: ChoqueDetectado[]) {
  const claves = choques.map(claveDe);

  // Lo que ya está anotado, con su estado. Un choque YA RESUELTO no se vuelve a
  // abrir: dirección dijo qué hacer y la respuesta sigue valiendo mientras el
  // choque sea el mismo. Si Notion pone a otra persona, la clave cambia y eso sí
  // es una pregunta nueva.
  const existentes = await db.conflictoResponsable.findMany({
    where: { organizationId, clave: { in: claves.length ? claves : ["—"] } },
    select: { clave: true },
  });
  const yaEstaban = new Set(existentes.map((c) => c.clave));

  const nuevos = choques.filter((c) => !yaEstaban.has(claveDe(c)));

  if (nuevos.length > 0) {
    await db.conflictoResponsable.createMany({
      data: nuevos.map((c) => ({
        organizationId,
        productId: c.productId,
        tipo: c.tipo,
        userId: c.tipo === "sobra_en_jarvis" ? c.userId : null,
        nombreEnNotion: c.tipo === "sin_cruzar" ? c.nombreEnNotion : null,
        clave: claveDe(c),
      })),
      skipDuplicates: true,
    });
  }

  if (yaEstaban.size > 0) {
    await db.conflictoResponsable.updateMany({
      where: { organizationId, clave: { in: [...yaEstaban] } },
      data: { vistoEn: new Date() },
    });
  }

  // Los que estaban pendientes y ya no aparecen se cierran solos: alguien
  // arregló el nombre en Notion, o quitó la fila. Preguntar por un problema que
  // ya no existe es peor que no preguntar.
  const cerrados = await db.conflictoResponsable.updateMany({
    where: {
      organizationId,
      estado: "pendiente",
      ...(claves.length ? { clave: { notIn: claves } } : {}),
    },
    data: { estado: "resuelto", decision: "desaparecio", decididoEn: new Date() },
  });

  if (nuevos.length > 0) await avisarADireccion(organizationId, nuevos.length);

  return { nuevos: nuevos.length, cerrados: cerrados.count };
}

/**
 * Las decisiones ya tomadas, para que la sincronización las respete.
 *
 * Es lo que evita que dirección tenga que contestar lo mismo todos los días: si
 * ya dijeron "quitar a Ana de CYPERUS", la pasada siguiente lo hace sin volver a
 * preguntar.
 */
export async function decisionesVigentes(organizationId: string) {
  const filas = await db.conflictoResponsable.findMany({
    where: { organizationId, estado: "resuelto", decision: { in: ["dejar", "quitar", "ignorar"] } },
    select: { clave: true, decision: true },
  });
  return new Map(filas.map((f) => [f.clave, f.decision as Decision]));
}

async function avisarADireccion(organizationId: string, cuantos: number) {
  // OWNER y DIRECTOR: Emilia, que lleva contenido, y el resto de dirección para
  // que un choque no se quede trabado si ella no está.
  const gente = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
    select: { id: true },
  });
  if (gente.length === 0) return;

  const texto =
    cuantos === 1
      ? "Notion y Jarvis no coinciden en quién lleva un producto. Decidí qué hacer."
      : `Notion y Jarvis no coinciden en quién lleva ${cuantos} productos. Decidí qué hacer.`;
  const link = "/dashboard/contenido?vista=conflictos";

  await db.notification.createMany({
    data: gente.map((u) => ({ userId: u.id, type: "conflicto_responsable", message: texto, link })),
  });

  await avisarAVarios(
    gente.map((u) => u.id),
    {
      titulo: "Responsables: hay algo que decidir",
      cuerpo: texto,
      url: link,
      etiqueta: "conflicto-responsable",
    },
  );
}
