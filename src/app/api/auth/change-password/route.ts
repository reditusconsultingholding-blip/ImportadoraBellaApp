import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getSession, createSession } from "@/lib/auth";
import { frenarUsuario } from "@/lib/limite";
import { z } from "zod";
import { leerCuerpo } from "@/lib/validacion";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Pide la clave actual: sin tope, una sesión robada podría adivinarla.
  const frenado = frenarUsuario("cambiar-clave", session.userId, 8, 15 * 60 * 1000);
  if (frenado) return frenado;

  const lectura = await leerCuerpo(
    req,
    z.object({
      currentPassword: z.string().max(200).optional(),
      newPassword: z.string().max(200).optional(),
      confirmPassword: z.string().max(200).optional(),
    }),
  );
  if (!lectura.ok) return lectura.respuesta;
  const { currentPassword, newPassword, confirmPassword } = lectura.datos;

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres." },
      { status: 400 }
    );
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "Las contraseñas no coinciden." }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });

  // Se pide la contraseña actual siempre, MENOS en el primer ingreso — ahí la
  // persona acaba de escribirla en el login y la pantalla es obligatoria.
  // Sin esta verificación, una sesión abierta y desatendida alcanzaría para
  // que alguien se apropie de la cuenta cambiándole la clave.
  if (!user.mustChangePassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Escribe tu contraseña actual." }, { status: 400 });
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "La contraseña actual no es correcta." }, { status: 403 });
    }
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "La contraseña nueva tiene que ser distinta de la actual." },
        { status: 400 }
      );
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await db.user.update({
    where: { id: user.id },
    // Subir la versión cierra las demás sesiones abiertas con la clave vieja.
    // Esta misma se renueva abajo con la versión nueva.
    data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
  });

  await createSession({
    userId: updated.id,
    organizationId: updated.organizationId,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    mustChangePassword: false,
  });

  return NextResponse.json({ ok: true });
}
