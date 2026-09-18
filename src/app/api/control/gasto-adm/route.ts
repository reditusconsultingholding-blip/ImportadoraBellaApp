import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";

// El gasto administrativo de un mes, entero.
//
// Se reparte por día (÷30) y dentro del día entre los productos según sus
// pedidos, igual que en la planilla. Un solo número por mes: el detalle de qué
// lo compone lo lleva administración en su propio archivo, y traerlo acá sería
// construir una contabilidad que nadie pidió.

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json(
      { error: "Cargar el gasto administrativo es de dirección con permiso de finanzas." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as { anio?: number; mes?: number; valor?: number };
  const anio = Number(body.anio);
  const mes = Number(body.mes);
  const valor = Number(body.valor);

  if (!anio || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }
  if (!isFinite(valor) || valor < 0) {
    return NextResponse.json({ error: "El gasto tiene que ser un número positivo." }, { status: 400 });
  }

  const fila = await db.gastoAdmMes.upsert({
    where: { organizationId_anio_mes: { organizationId: session.organizationId, anio, mes } },
    create: { organizationId: session.organizationId, anio, mes, valor },
    update: { valor },
  });

  return NextResponse.json({ gastoAdm: fila });
}
