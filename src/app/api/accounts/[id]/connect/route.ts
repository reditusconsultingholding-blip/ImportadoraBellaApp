import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncAdAccount } from "@/lib/integrations/sync";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

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
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
