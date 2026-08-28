import { db } from "@/lib/db";
import type { ChatTurn } from "@/lib/agent";

// Las conversaciones con Jarvis, guardadas por usuario.
//
// Antes vivían solo en el estado de React: recargar la página las borraba. Una
// conversación donde se razonó por qué un producto dejó de rendir vale tanto
// como el reporte de ese día, y se perdía sola.

/** Cuántos caracteres del primer mensaje se usan como título. */
const LARGO_TITULO = 60;

/**
 * El título sale del primer mensaje del usuario.
 *
 * Se podría pedirle uno al modelo, pero eso es una llamada más antes de que
 * llegue la primera respuesta — y lo que el usuario escribió describe la
 * conversación bastante bien.
 */
export function tituloDesde(texto: string) {
  const limpio = texto.trim().replace(/\s+/g, " ");
  if (limpio.length <= LARGO_TITULO) return limpio || "Conversación";
  return limpio.slice(0, LARGO_TITULO).trimEnd() + "…";
}

export async function listarConversaciones(userId: string) {
  return db.jarvisConversacion.findMany({
    where: { userId },
    select: { id: true, titulo: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function leerConversacion(userId: string, id: string) {
  // El userId va en el WHERE y no se chequea después: así una conversación de
  // otra persona no se encuentra, en vez de encontrarse y rechazarse.
  const conv = await db.jarvisConversacion.findFirst({
    where: { id, userId },
    select: {
      id: true,
      titulo: true,
      mensajes: {
        select: { rol: true, contenido: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!conv) return null;

  return {
    id: conv.id,
    titulo: conv.titulo,
    mensajes: conv.mensajes.map((m) => ({
      role: m.rol === "user" ? ("user" as const) : ("assistant" as const),
      content: m.contenido,
    })) satisfies ChatTurn[],
  };
}

export async function borrarConversacion(userId: string, id: string) {
  // deleteMany y no delete: si el id es de otra persona borra cero filas en vez
  // de lanzar, que es justo lo que se quiere.
  const r = await db.jarvisConversacion.deleteMany({ where: { id, userId } });
  return r.count > 0;
}

/**
 * Guarda el turno: la pregunta y la respuesta.
 *
 * Devuelve el id de la conversación — la crea si no venía ninguna, que es el
 * caso del primer mensaje de un chat nuevo.
 */
export async function guardarTurno(o: {
  organizationId: string;
  userId: string;
  conversacionId: string | null;
  pregunta: string;
  respuesta: string;
}) {
  let id = o.conversacionId;

  if (id) {
    // Que exista y sea de esta persona. Sin esto, mandar el id de otro pegaría
    // mensajes en su conversación.
    const propia = await db.jarvisConversacion.findFirst({
      where: { id, userId: o.userId },
      select: { id: true },
    });
    if (!propia) id = null;
  }

  if (!id) {
    const nueva = await db.jarvisConversacion.create({
      data: {
        organizationId: o.organizationId,
        userId: o.userId,
        titulo: tituloDesde(o.pregunta),
      },
      select: { id: true },
    });
    id = nueva.id;
  }

  await db.jarvisMensaje.createMany({
    data: [
      { conversacionId: id, rol: "user", contenido: o.pregunta },
      { conversacionId: id, rol: "assistant", contenido: o.respuesta },
    ],
  });

  // Toca la conversación para que suba en la lista: lo último que hablaste es
  // lo que vas a querer retomar.
  await db.jarvisConversacion.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return id;
}
