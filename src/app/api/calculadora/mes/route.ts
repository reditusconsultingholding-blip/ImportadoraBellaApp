import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { shopifyVsAds } from "@/lib/shopify-vs-ads";
import { diaEcuador } from "@/lib/control-publicitario";

// Lo que pasó de verdad con cada producto en un mes, para la Calculadora
// (Emilia, video del 20-nov: «que me pueda mostrar lo histórico, que está bien,
// pero también me aparezca por meses»).
//
// Son los mismos números de «Riesgo por producto»: pedidos y confirmados de la
// planilla del área comercial, y el gasto de Meta + TikTok sin la cuenta de
// WhatsApp. Así la confirmación y el CPA que la Calculadora propone para un mes
// son los que Emilia ve en el control de ese mes.

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const mes = req.nextUrl.searchParams.get("mes") ?? "";
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return NextResponse.json({ error: "Falta el mes (AAAA-MM)." }, { status: 400 });
  const anio = Number(m[1]);
  const numMes = Number(m[2]);
  if (numMes < 1 || numMes > 12) return NextResponse.json({ error: "Mes inválido." }, { status: 400 });

  const desde = new Date(Date.UTC(anio, numMes - 1, 1));
  const finDeMes = new Date(Date.UTC(anio, numMes, 0));
  const hoy = diaEcuador();
  if (desde > hoy) return NextResponse.json({ mes, hasta: null, productos: {} });
  const hasta = finDeMes < hoy ? finDeMes : hoy;

  const datos = await shopifyVsAds(session.organizationId, desde, hasta);
  const productos: Record<string, { pedidos: number; confirmados: number; gasto: number }> = {};
  for (const f of datos.productos) {
    if (!f.productId) continue;
    productos[f.nombre] = {
      pedidos: f.ventas,
      confirmados: f.confirmados,
      gasto: Math.round(f.gasto * 100) / 100,
    };
  }
  return NextResponse.json({ mes, hasta: hasta.toISOString().slice(0, 10), productos });
}
