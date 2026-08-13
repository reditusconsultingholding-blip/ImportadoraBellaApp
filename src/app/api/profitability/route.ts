import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { getProfitability, withDerived } from "@/lib/profitability";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month") ?? undefined;
  const data = await getProfitability(session.organizationId, month);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Solo un Director u Administrador puede cargar rentabilidad." }, { status: 403 });
  }

  const body = await req.json();
  const {
    month,
    productName,
    orders,
    cpa,
    revenueAccum,
    adSpendAccum,
    operatingExpenseAccum,
    adminExpenseAccum,
    profitAccum,
    merchandiseAccum,
    desiredProfitPerOrder,
  } = body ?? {};

  if (!month || !productName?.trim()) {
    return NextResponse.json({ error: "Faltan mes y producto." }, { status: 400 });
  }

  const data = {
    orders: Number(orders) || 0,
    cpa: Number(cpa) || 0,
    revenueAccum: Number(revenueAccum) || 0,
    adSpendAccum: Number(adSpendAccum) || 0,
    operatingExpenseAccum: Number(operatingExpenseAccum) || 0,
    adminExpenseAccum: Number(adminExpenseAccum) || 0,
    profitAccum: Number(profitAccum) || 0,
    merchandiseAccum: merchandiseAccum != null && merchandiseAccum !== "" ? Number(merchandiseAccum) : null,
    desiredProfitPerOrder:
      desiredProfitPerOrder != null && desiredProfitPerOrder !== "" ? Number(desiredProfitPerOrder) : null,
  };

  const row = await db.productProfitability.upsert({
    where: {
      organizationId_month_productName: {
        organizationId: session.organizationId,
        month,
        productName: productName.trim(),
      },
    },
    create: { organizationId: session.organizationId, month, productName: productName.trim(), ...data },
    update: data,
  });

  return NextResponse.json({ row: withDerived(row) });
}
