import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { leerCuerpo, clave } from "@/lib/validacion";
import { contar, demasiados, ipDe } from "@/lib/limite";
import { contextoDelPedido, registrarActividad } from "@/lib/actividad";

// Elegir la contraseña nueva con el enlace que llegó por correo.
//
// Al usarse: el enlace se borra (no sirve dos veces), se cierran TODAS las
// sesiones abiertas (sessionVersion), y la persona entra de nuevo con la
// clave nueva. Si alguien pidió el enlace porque le robaron la cuenta, esto
// saca al intruso.

export async function POST(req: Request) {
  const freno = contar(`restablecer-ip|${ipDe(req)}`, 10, 15 * 60 * 1000);
  if (!freno.ok) return demasiados(freno.esperaSeg);

  const lectura = await leerCuerpo(
    req,
    z.object({ token: z.string().min(20).max(200), clave, confirmacion: z.string().max(200) }),
  );
  if (!lectura.ok) return lectura.respuesta;
  const { token, clave: nueva, confirmacion } = lectura.datos;
  if (nueva !== confirmacion) {
    return NextResponse.json({ error: "Las dos contraseñas no coinciden." }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { claveResetHash: createHash("sha256").update(token).digest("hex") },
    select: { id: true, organizationId: true, claveResetVence: true },
  });
  if (!user || !user.claveResetVence || user.claveResetVence < new Date()) {
    return NextResponse.json(
      { error: "El enlace venció o ya se usó. Pide uno nuevo desde la pantalla de entrada." },
      { status: 400 },
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(nueva, 10),
      mustChangePassword: false,
      sessionVersion: { increment: 1 },
      claveResetHash: null,
      claveResetVence: null,
    },
  });

  registrarActividad({
    organizationId: user.organizationId,
    userId: user.id,
    tipo: "recuperacion",
    ruta: "/restablecer",
    detalle: "Eligió una contraseña nueva con el enlace del correo",
    ...(await contextoDelPedido()),
  });

  return NextResponse.json({ ok: true });
}
