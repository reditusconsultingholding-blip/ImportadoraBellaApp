import { db } from "@/lib/db";

// Un requerimiento con fecha de entrega aparece solo en el día a día.
//
// POR QUÉ
// Hasta ahora eran dos mundos. Se cargaba la pieza en Requerimientos con su
// fecha de entrega, y después alguien tenía que volver a escribirla a mano en
// el tablero del día para que el editor la viera y para que contara en el
// aviso de las ocho. Cuando no se escribía —que era casi siempre— la pieza
// existía en el sistema y no existía para nadie.
//
// Ahora la tarea nace, se mueve y se cierra sola a partir del requerimiento.
//
// EN UN SOLO SENTIDO, A PROPÓSITO
// El requerimiento manda sobre el día, el responsable y el producto: son datos
// que se deciden al planificar y que reescribirlos desde el tablero solo
// generaría dos versiones de la verdad.
//
// El estado va en el otro sentido y con una sola excepción. Quien edita marca
// su avance en el tablero —"en progreso", "listo"— y eso no se pisa. Lo único
// que baja del requerimiento es el cierre: cuando una pieza queda aprobada,
// realizada, editada o testeada ya no hay nada que hacer con ella, y dejarla
// como pendiente en el tablero haría que el aviso de las ocho reclame trabajo
// que ya está hecho.

/** Los estados de Requirement en los que la pieza ya no tiene trabajo encima. */
const TERMINADOS = new Set(["APROBADO", "REALIZADO", "EDITADO", "TESTEADO"]);

/**
 * La fecha de entrega, como marca de día para TareaDiaria.fecha.
 *
 * No se corre a la zona de Ecuador. `dueDate` no es un instante: nace de un
 * input de fecha —"2026-09-19"— que el servidor guarda como medianoche UTC de
 * ese mismo día, igual que Ronda.fechaEntrega. Restarle las cinco horas de
 * Ecuador, como sí hay que hacer con un instante real, la dejaba un día antes:
 * la pieza que se entregaba el 19 aparecía en el tablero del 18.
 *
 * Solo se trunca, por si alguna fila vieja quedó con hora.
 */
export function marcaDeDia(fecha: Date) {
  return new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate()));
}

/**
 * Qué estado le toca a la tarea del tablero según su requerimiento.
 *
 * - Tarea nueva: HECHO si la pieza ya está cerrada, PENDIENTE si no.
 * - Tarea existente: solo el cierre baja (HECHO). Si la pieza sigue abierta
 *   devuelve undefined —no tocar—, para no pisar el "en progreso" o "listo"
 *   que marcó quien edita.
 */
export function estadoDeTarea(statusRequerimiento: string, tareaExiste: boolean): "HECHO" | "PENDIENTE" | undefined {
  const cerrado = TERMINADOS.has(statusRequerimiento);
  if (!tareaExiste) return cerrado ? "HECHO" : "PENDIENTE";
  return cerrado ? "HECHO" : undefined;
}

/**
 * Deja la tarea del tablero en línea con su requerimiento.
 *
 * Se llama después de crear o de editar una pieza. Es idempotente: correrla
 * dos veces con los mismos datos no cambia nada.
 *
 * Sin fecha de entrega no hay tarea —no se sabría en qué día ponerla—, así que
 * si la fecha se borra, la tarea se borra con ella. Es lo mismo que pasaría si
 * alguien la hubiera escrito a mano y después le sacaran el día: deja de tener
 * lugar en el tablero.
 */
export async function sincronizarTareaDeRequerimiento(requirementId: string) {
  const req = await db.requirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true,
      organizationId: true,
      adName: true,
      dueDate: true,
      ownerId: true,
      productId: true,
      status: true,
      tarea: { select: { id: true, estado: true } },
    },
  });
  if (!req) return null;

  if (!req.dueDate) {
    if (req.tarea) await db.tareaDiaria.delete({ where: { id: req.tarea.id } });
    return null;
  }

  const fecha = marcaDeDia(req.dueDate);

  if (!req.tarea) {
    return db.tareaDiaria.create({
      data: {
        organizationId: req.organizationId,
        requirementId: req.id,
        fecha,
        ownerId: req.ownerId,
        productId: req.productId,
        productoTexto: req.adName,
        estado: estadoDeTarea(req.status, false)!,
        origen: "requerimiento",
      },
      select: { id: true },
    });
  }

  return db.tareaDiaria.update({
    where: { id: req.tarea.id },
    data: {
      fecha,
      ownerId: req.ownerId,
      productId: req.productId,
      productoTexto: req.adName,
      // Solo el cierre baja del requerimiento; el avance intermedio que cargó
      // quien edita se respeta.
      ...(estadoDeTarea(req.status, true) ? { estado: "HECHO" } : {}),
    },
    select: { id: true },
  });
}
