import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";

// El PDF guardado del cierre de un día: facturado, pauta y utilidad estimada.
//
// Hasta acá solo pedía tener la sesión iniciada. O sea que cualquiera con
// cuenta —incluso alguien recién registrado, sin rol— podía pedir el reporte
// de cualquier día de su organización y leer la facturación completa. La
// pantalla que lista los reportes está cerrada por rol desde siempre, pero la
// dirección de este PDF es adivinable a partir de un id, y el listado se
// obtiene de /api/notifications, que sí ve todo el mundo.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json(
      { error: "El informe con cifras lo ve la dirección." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const report = await db.dailyReport.findUnique({ where: { id } });
  if (!report || report.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  const dateStr = report.date.toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(report.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="reporte-${dateStr}.pdf"`,
    },
  });
}
