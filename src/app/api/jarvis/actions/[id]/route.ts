import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canApproveActions } from "@/lib/permissions";
import { db } from "@/lib/db";
import { executeApprovedAction } from "@/lib/integrations/actions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Aprobar dispara una accion real sobre una campania: es decision de
  // direccion, no de quien pase por la pantalla.
  if (!canApproveActions(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { id } = await params;
  const { decision } = (await req.json()) as { decision: "approve" | "reject" };

  const action = await db.pendingAction.findUnique({
    where: { id },
    include: { campaign: { include: { adAccount: true } } },
  });
  if (!action || action.campaign.adAccount.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Acción no encontrada." }, { status: 404 });
  }
  if (action.status !== "PENDING") {
    return NextResponse.json({ error: `Esta acción ya está en estado ${action.status}.` }, { status: 409 });
  }

  if (decision === "reject") {
    await db.pendingAction.update({
      where: { id },
      data: { status: "REJECTED", resolvedAt: new Date(), approvedById: session.userId },
    });
    return NextResponse.json({ ok: true, status: "REJECTED" });
  }

  await db.pendingAction.update({
    where: { id },
    data: { status: "APPROVED", approvedById: session.userId },
  });

  try {
    await executeApprovedAction(id);
    return NextResponse.json({ ok: true, status: "EXECUTED" });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        status: "FAILED",
        error:
          "No se pudo ejecutar contra la cuenta real todavía (falta conectar el token de acceso). La acción quedó aprobada y registrada.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 202 }
    );
  }
}
