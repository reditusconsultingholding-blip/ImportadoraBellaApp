import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { db } from "@/lib/db";
import { syncAdAccount } from "@/lib/integrations/sync";
import { frenarUsuario } from "@/lib/limite";
import { mensajeSeguro } from "@/lib/respuesta";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Cada sync consume cuota de Windsor.
  const frenado = frenarUsuario("sync-cuenta", session.userId, 20, 10 * 60 * 1000);
  if (frenado) return frenado;
  // Mismo permiso que crear la cuenta. Antes esta ruta solo miraba la
  // organización: cualquier editor podía reemplazar el token de producción
  // de una cuenta publicitaria, borrarla o quemar cuota sincronizando.
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { id } = await params;
  const account = await db.adAccount.findUnique({ where: { id } });
  if (!account || account.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }
  if (!account.connectedAt) {
    return NextResponse.json({ error: "Esta cuenta todavía no tiene token conectado." }, { status: 409 });
  }

  try {
    await syncAdAccount(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: mensajeSeguro(err) },
      { status: 502 }
    );
  }
}
