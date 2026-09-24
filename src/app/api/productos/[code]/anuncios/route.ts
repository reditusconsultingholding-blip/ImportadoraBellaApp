import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { anunciosDeProducto } from "@/lib/anuncios-producto";
import type { PeriodoReporte } from "@/lib/reportes-producto";
import { jsonComprimido } from "@/lib/respuesta";

// Los anuncios de un producto (o de una de sus campañas) con su rendimiento.
//
// Mismo criterio que el reporte del producto: sin el permiso de finanzas no
// salen gasto, CPA, CPM, ingreso ni ROAS. Compras, CTR y el veredicto sí,
// porque es lo que el equipo creativo necesita para saber qué pieza funciona.

const PERIODOS: PeriodoReporte[] = ["diario", "quincenal", "historico"];

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const { code } = await params;
  const p = req.nextUrl.searchParams;
  const periodo = PERIODOS.includes(p.get("periodo") as PeriodoReporte) ? (p.get("periodo") as PeriodoReporte) : "quincenal";
  const campana = p.get("campana") || undefined;

  const r = await anunciosDeProducto(session.organizationId, code, periodo, campana);
  if (!r) return NextResponse.json({ error: "No encontrado." }, { status: 404 });

  if (await veLasCifras(session.userId)) return jsonComprimido({ ...r, verCifras: true });

  // Sin permiso para ver cifras no va ninguno de los dos: el objetivo y el de
  // equilibrio dicen, juntos, cuánto deja el producto.
  return jsonComprimido({
    cpaObjetivo: null,
    cpaEquilibrio: null,
    sinDatos: r.sinDatos,
    verCifras: false,
    anuncios: r.anuncios.map((a) => ({
      ...a,
      gasto: null,
      ingreso: null,
      cpa: null,
      cpm: null,
      roas: null,
    })),
  });
}
