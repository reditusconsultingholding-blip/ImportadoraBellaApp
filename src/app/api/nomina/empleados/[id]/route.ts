import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPayrollViewer } from "@/lib/payroll-access";

const MODES = ["SEMANAL", "DIARIO", "POR_PIEZA"] as const;
type Mode = (typeof MODES)[number];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPayrollViewer();
  if (!session) return NextResponse.json({ error: "Sin permiso de nómina." }, { status: 403 });

  const { id } = await params;
  const employee = await db.employee.findUnique({ where: { id } });
  if (!employee || employee.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Persona no encontrada." }, { status: 404 });
  }

  const body = (await req.json()) as {
    payMode?: string;
    payAmount?: number;
    daysPerWeek?: number;
    currency?: string;
    position?: string;
    active?: boolean;
  };

  const payMode = MODES.includes(body.payMode as Mode) ? (body.payMode as Mode) : undefined;
  const payAmount =
    typeof body.payAmount === "number" && body.payAmount >= 0 ? body.payAmount : undefined;
  const daysPerWeek =
    typeof body.daysPerWeek === "number" && body.daysPerWeek > 0 && body.daysPerWeek <= 7
      ? body.daysPerWeek
      : undefined;

  const updated = await db.employee.update({
    where: { id },
    data: {
      ...(payMode ? { payMode } : {}),
      ...(payAmount !== undefined ? { payAmount } : {}),
      ...(daysPerWeek !== undefined ? { daysPerWeek } : {}),
      ...(body.currency?.trim() ? { currency: body.currency.trim().toUpperCase() } : {}),
      ...(body.position?.trim() ? { position: body.position.trim() } : {}),
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    },
  });

  return NextResponse.json({ ok: true, employee: { id: updated.id } });
}
