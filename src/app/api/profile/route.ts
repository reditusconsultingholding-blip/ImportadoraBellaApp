import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Datos que cada persona edita de sí misma. Nada de roles ni permisos acá:
// eso se toca desde Usuarios y solo un administrador puede.

// Una miniatura de 256px en JPEG ronda los 20-40 KB. El tope deja aire de
// sobra y frena que alguien pegue una foto de 8 MB en la base.
const MAX_AVATAR_BYTES = 300 * 1024;

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    phone?: string | null;
    birthDate?: string | null;
    avatarUrl?: string | null;
  };

  const data: {
    name?: string;
    phone?: string | null;
    birthDate?: Date | null;
    avatarUrl?: string | null;
  } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "El nombre es muy corto." }, { status: 400 });
    }
    data.name = name;
  }

  if (body.phone !== undefined) {
    const phone = body.phone?.trim() ?? "";
    data.phone = phone || null;
  }

  if (body.birthDate !== undefined) {
    if (!body.birthDate) {
      data.birthDate = null;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) {
        return NextResponse.json({ error: "La fecha no es válida." }, { status: 400 });
      }
      const date = new Date(`${body.birthDate}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime()) || date > new Date()) {
        return NextResponse.json({ error: "La fecha no es válida." }, { status: 400 });
      }
      data.birthDate = date;
    }
  }

  if (body.avatarUrl !== undefined) {
    if (!body.avatarUrl) {
      data.avatarUrl = null;
    } else {
      // Solo se acepta una imagen embebida. Una URL externa dejaría que
      // cualquiera apunte la foto a un servidor que registre quién la mira.
      const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.avatarUrl);
      if (!match) {
        return NextResponse.json(
          { error: "La imagen no es válida. Subila desde el selector de archivos." },
          { status: 400 }
        );
      }
      const bytes = Math.floor((match[2].length * 3) / 4);
      if (bytes > MAX_AVATAR_BYTES) {
        return NextResponse.json(
          { error: "La imagen pesa demasiado. Probá con una más chica." },
          { status: 413 }
        );
      }
      data.avatarUrl = body.avatarUrl;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No hay nada que cambiar." }, { status: 400 });
  }

  const updated = await db.user.update({
    where: { id: session.userId },
    data,
    select: { name: true, phone: true, birthDate: true, avatarUrl: true },
  });

  // El nombre en la ficha de nómina sigue al del usuario.
  if (data.name) {
    await db.employee.updateMany({
      where: { userId: session.userId },
      data: { fullName: data.name },
    });
  }

  return NextResponse.json({
    ok: true,
    profile: {
      name: updated.name,
      phone: updated.phone,
      birthDate: updated.birthDate ? updated.birthDate.toISOString().slice(0, 10) : null,
      avatarUrl: updated.avatarUrl,
    },
  });
}
