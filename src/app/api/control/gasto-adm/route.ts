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

  const body = (await req.json()) as {
    anio?: number;
    mes?: number;
    valor?: number;
    enlace?: string | null;
  };
  const anio = Number(body.anio);
  const mes = Number(body.mes);

  if (!anio || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  }

  // Se puede mandar el valor, el enlace o los dos: son dos campos que se
  // guardan por separado al salir de cada uno.
  const cambios: { valor?: number; enlace?: string | null } = {};
  if (body.valor !== undefined) {
    const valor = Number(body.valor);
    if (!isFinite(valor) || valor < 0) {
      return NextResponse.json({ error: "El gasto tiene que ser un número positivo." }, { status: 400 });
    }
    cambios.valor = valor;
  }
  if (body.enlace !== undefined) {
    const enlace = body.enlace?.trim() || null;
    // Solo enlaces web: es algo que se va a abrir con un clic.
    if (enlace && !/^https?:\/\//i.test(enlace)) {
      return NextResponse.json({ error: "El enlace tiene que empezar con https://" }, { status: 400 });
    }
    cambios.enlace = enlace;
  }

  const existente = await db.gastoAdmMes.findUnique({
    where: { organizationId_anio_mes: { organizationId: session.organizationId, anio, mes } },
    select: { id: true },
  });
  if (!existente && cambios.valor === undefined) {
    return NextResponse.json(
      { error: "Cargá primero el total del mes; el enlace va al lado de ese número." },
      { status: 400 },
    );
  }

  const fila = await db.gastoAdmMes.upsert({
    where: { organizationId_anio_mes: { organizationId: session.organizationId, anio, mes } },
    create: { organizationId: session.organizationId, anio, mes, valor: cambios.valor ?? 0, enlace: cambios.enlace },
    update: cambios,
  });

  return NextResponse.json({ gastoAdm: fila });
}
