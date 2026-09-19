import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { db } from "@/lib/db";
import { syncAdAccount } from "@/lib/integrations/sync";
import { frenarUsuario } from "@/lib/limite";
import { mensajeSeguro } from "@/lib/respuesta";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Sale a la API de la plataforma con credenciales.
  const frenado = frenarUsuario("conectar", session.userId, 10, 10 * 60 * 1000);
  if (frenado) return frenado;
  // Mismo permiso que crear la cuenta. Antes esta ruta solo miraba la
  // organización: cualquier editor podía reemplazar el token de producción
  // de una cuenta publicitaria, borrarla o quemar cuota sincronizando.
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { id } = await params;
  const { externalId, accessToken } = (await req.json()) as {
    externalId: string;
    accessToken: string;
  };

  if (!externalId?.trim() || !accessToken?.trim()) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  const account = await db.adAccount.findUnique({ where: { id } });
  if (!account || account.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  await db.adAccount.update({
    where: { id },
    data: { externalId: externalId.trim(), accessToken: accessToken.trim(), connectedAt: new Date() },
  });

  try {
    await syncAdAccount(id);
    return NextResponse.json({ ok: true, synced: true });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      synced: false,
      warning:
        "Se guardó el token, pero la primera sincronización falló — revisa que el token y el ID sean correctos.",
      detail: mensajeSeguro(err),
    });
  }
}
