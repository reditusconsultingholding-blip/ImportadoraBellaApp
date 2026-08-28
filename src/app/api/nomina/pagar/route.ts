import { NextRequest, NextResponse } from "next/server";
import { getPayrollViewer } from "@/lib/payroll-access";
import { closeWeek, startOfWeek } from "@/lib/payroll";

// Cierra la semana y congela los montos. A partir de aquí, tocar un sueldo ya
// no reescribe lo que se pagó.
export async function POST(req: NextRequest) {
  const session = await getPayrollViewer();
  if (!session) return NextResponse.json({ error: "Sin permiso de nómina." }, { status: 403 });

  const { weekStart } = (await req.json()) as { weekStart?: string };
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "Semana inválida." }, { status: 400 });
  }

  const monday = startOfWeek(new Date(`${weekStart}T00:00:00.000Z`));

  try {
    const result = await closeWeek(session.organizationId, monday, session.name);
    return NextResponse.json({ ok: true, total: result.total, paidAt: result.paidAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "No se pudo cerrar la semana." },
      { status: 500 }
    );
  }
}
