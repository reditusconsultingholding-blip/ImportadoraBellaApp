import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

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
