import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { leerCuerpo, correo } from "@/lib/validacion";
import { contar, demasiados, ipDe } from "@/lib/limite";
import { appUrl, emailConfigured, recuperarClaveHtml, sendEmail } from "@/lib/email";
import { contextoDelPedido, registrarActividad } from "@/lib/actividad";

// Pedir un enlace para elegir una contraseña nueva.
//
// La respuesta es SIEMPRE la misma, exista o no el correo: si dijera "ese
// correo no está registrado", serviría para averiguar quién tiene cuenta. El
// correo sale en segundo plano por lo mismo: si se esperara el envío, la
// demora delataría que la cuenta existe.
//
// El enlace vence en 30 minutos, sirve una vez, y en la base se guarda solo su
// SHA-256. Pedir uno nuevo invalida el anterior.

const MINUTOS = 30;
const RESPUESTA = {
  ok: true,
  mensaje: "Si el correo tiene una cuenta, te llegó un enlace para elegir una contraseña nueva. Revisa también el correo no deseado.",
};

export async function POST(req: Request) {
  // Freno por IP y, abajo, por correo: sin esto se podría llenarle la
  // bandeja a alguien o usarlo para mandar correos en masa.
  const porIp = contar(`recuperar-ip|${ipDe(req)}`, 5, 15 * 60 * 1000);
  if (!porIp.ok) return demasiados(porIp.esperaSeg);

  const lectura = await leerCuerpo(req, z.object({ email: correo }));
  if (!lectura.ok) return lectura.respuesta;
  const { email } = lectura.datos;

  const porCorreo = contar(`recuperar-correo|${email}`, 3, 60 * 60 * 1000);
  if (!porCorreo.ok) return NextResponse.json(RESPUESTA);

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, organizationId: true },
  });
  if (!user) return NextResponse.json(RESPUESTA);

  const token = randomBytes(32).toString("base64url");
  await db.user.update({
    where: { id: user.id },
    data: {
      claveResetHash: createHash("sha256").update(token).digest("hex"),
      claveResetVence: new Date(Date.now() + MINUTOS * 60 * 1000),
    },
  });

  registrarActividad({
    organizationId: user.organizationId,
    userId: user.id,
    tipo: "recuperacion",
    ruta: "/login",
    detalle: emailConfigured() ? "Pidió un enlace para recuperar la clave" : "Pidió recuperar la clave (correo sin configurar)",
    ...(await contextoDelPedido()),
  });

  if (emailConfigured()) {
    void sendEmail({
      to: [user.email],
      subject: "Restablecer tu contraseña de Jarvis",
      html: recuperarClaveHtml({
        nombre: user.name.split(" ")[0],
        enlace: `${appUrl()}/restablecer?token=${token}`,
        minutos: MINUTOS,
      }),
    });
  }

  return NextResponse.json(RESPUESTA);
}
