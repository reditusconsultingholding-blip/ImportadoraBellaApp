import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { syncAdAccount } from "@/lib/integrations/sync";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

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
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
