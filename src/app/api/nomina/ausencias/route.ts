import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPayrollViewer } from "@/lib/payroll-access";

// Marca o desmarca un día como no trabajado. Es un toggle a propósito: en la
// pantalla se hace clic sobre el día, no se abre un formulario.
export async function POST(req: NextRequest) {
  const session = await getPayrollViewer();
  if (!session) return NextResponse.json({ error: "Sin permiso de nómina." }, { status: 403 });

  const { employeeId, date, reason } = (await req.json()) as {
    employeeId?: string;
    date?: string; // YYYY-MM-DD
    reason?: string;
  };

  if (!employeeId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }

  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee || employee.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Persona no encontrada." }, { status: 404 });
  }

  const day = new Date(`${date}T00:00:00.000Z`);

  const existing = await db.payrollAbsence.findUnique({
    where: { employeeId_date: { employeeId, date: day } },
  });

  if (existing) {
    await db.payrollAbsence.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true, absent: false });
  }

  await db.payrollAbsence.create({
    data: { employeeId, date: day, reason: reason?.trim() || null },
  });
  return NextResponse.json({ ok: true, absent: true });
}
