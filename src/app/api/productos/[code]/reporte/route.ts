import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { reporteDeProducto, type CampanaDelReporte, type PeriodoReporte } from "@/lib/reportes-producto";

const PERIODOS: PeriodoReporte[] = ["diario", "quincenal", "historico"];

function campanaSinCifras(c: CampanaDelReporte) {
  return {
    id: c.id,
    nombre: c.nombre,
    plataforma: c.plataforma,
    compras: c.compras,
    tipoCampana: c.tipoCampana,
    lote: c.lote,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const { code } = await params;
  const periodoRaw = req.nextUrl.searchParams.get("periodo");
  const periodo = PERIODOS.includes(periodoRaw as PeriodoReporte) ? (periodoRaw as PeriodoReporte) : "quincenal";

  const reporte = await reporteDeProducto(session.organizationId, code, periodo);
  if (!reporte) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  const verCifras = await veLasCifras(session.userId);
  if (verCifras) return NextResponse.json({ reporte, verCifras });

  // Sin el permiso de finanzas: gasto, ingreso y CPA no salen del servidor.
  // Lo demás — mejor/peor campaña por nombre, formato winner, compras — sí,
  // porque es información de rendimiento creativo, no de plata.
  return NextResponse.json({
    reporte: {
      productId: reporte.productId,
      code: reporte.code,
      nombre: reporte.nombre,
      periodo: reporte.periodo,
      comprasTotal: reporte.comprasTotal,
      winners: reporte.winners,
      formatoWinner: reporte.formatoWinner,
      mejorCampana: reporte.mejorCampana ? campanaSinCifras(reporte.mejorCampana) : null,
      peorCampana: reporte.peorCampana ? campanaSinCifras(reporte.peorCampana) : null,
      campanas: reporte.campanas.map(campanaSinCifras),
    },
    verCifras,
  });
}
