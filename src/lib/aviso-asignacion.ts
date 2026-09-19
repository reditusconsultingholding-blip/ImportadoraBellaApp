import { db } from "@/lib/db";
import { avisarA } from "@/lib/push";
import { avisoEditorHtml, emailConfigured, sendEmail } from "@/lib/email";

// Aviso a quien le asignan una pieza: dentro de la app, al celular (push) y
// por correo.
//
// Hasta ahora asignar una pieza no avisaba a nadie: la persona se enteraba
// cuando abría el tablero. Se pidió que a los editores les llegue por correo
// (respuesta de dirección del 19 de septiembre de 2026).
//
// No se avisa cuando alguien se asigna algo a sí mismo (ya lo sabe) y el
// correo no lleva cifras de dinero: los editores no las ven en la app y el
// correo no puede ser la puerta de atrás. Si el correo falla, el aviso dentro
// de la app ya quedó: nunca se corta el flujo que lo llamó.
export async function avisarAsignacion(requirementId: string, asignadoPorId: string) {
  try {
    const pieza = await db.requirement.findUnique({
      where: { id: requirementId },
      select: {
        adName: true,
        dueDate: true,
        ownerId: true,
        product: { select: { name: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    if (!pieza?.owner || pieza.ownerId === asignadoPorId) return;

    const quien = await db.user.findUnique({ where: { id: asignadoPorId }, select: { name: true } });
    const producto = pieza.product?.name ?? null;
    const cuando = pieza.dueDate
      ? pieza.dueDate.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
      : null;
    const mensaje =
      `${quien?.name ?? "Dirección"} te asignó «${pieza.adName}»` +
      (producto ? ` de ${producto}` : "") +
      (cuando ? `, para el ${cuando}.` : ".");
    const link = "/dashboard/contenido?vista=requerimientos";

    await db.notification.create({
      data: { userId: pieza.owner.id, type: "asignacion", message: mensaje, link },
    });
    await avisarA(pieza.owner.id, { titulo: "Tienes una pieza nueva", cuerpo: mensaje, url: link, etiqueta: "asignacion" });

    if (emailConfigured()) {
      await sendEmail({
        to: [pieza.owner.email],
        subject: `Te asignaron «${pieza.adName}»`,
        html: avisoEditorHtml({
          nombre: pieza.owner.name.split(" ")[0],
          tarea: pieza.adName,
          producto,
          fecha: pieza.dueDate,
          quienAsigno: quien?.name ?? null,
        }),
      });
    }
  } catch (err) {
    console.error("[aviso-asignacion]", err instanceof Error ? err.message : err);
  }
}
