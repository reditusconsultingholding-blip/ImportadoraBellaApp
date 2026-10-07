import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { db } from "@/lib/db";
import { mensajeSeguro } from "@/lib/respuesta";

/** Alta y edición de las apps que se pagan todos los meses. */

type Cuerpo = {
  id?: string;
  nombre?: string;
  monto?: number | null;
  moneda?: string;
  diaDelMes?: number;
  avisarDiasAntes?: number;
  activo?: boolean;
  notas?: string | null;
};

function revisar(c: Cuerpo): string | null {
  if (c.nombre !== undefined && !c.nombre.trim()) return "Falta el nombre de la app.";
  if (c.diaDelMes !== undefined) {
    // 1 a 31. El 31 en un mes de 30 se resuelve al avisar, no acá: el mismo
    // registro vale para todos los meses del año.
    if (!Number.isInteger(c.diaDelMes) || c.diaDelMes < 1 || c.diaDelMes > 31) {
      return "El día de cobro va del 1 al 31.";
    }
  }
  if (c.avisarDiasAntes !== undefined) {
    if (!Number.isInteger(c.avisarDiasAntes) || c.avisarDiasAntes < 0 || c.avisarDiasAntes > 28) {
      return "Avisar con 0 a 28 días de anticipación.";
    }
  }
  if (c.monto != null && (!Number.isFinite(c.monto) || c.monto < 0)) {
    return "El monto no puede ser negativo.";
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Esto lo lleva dirección." }, { status: 403 });
  }

  const c = (await req.json().catch(() => ({}))) as Cuerpo;
  const mal = revisar(c);
  if (mal) return NextResponse.json({ error: mal }, { status: 400 });

  try {
    if (c.id) {
      // El organizationId va en el WHERE: un pago de otra empresa no se
      // encuentra, en vez de encontrarse y rechazarse.
      const propio = await db.pagoRecurrente.findFirst({
        where: { id: c.id, organizationId: session.organizationId },
        select: { id: true, diaDelMes: true },
      });
      if (!propio) return NextResponse.json({ error: "No existe ese pago." }, { status: 404 });

      // Si cambia el día de cobro, lo ya avisado este mes deja de valer: el
      // aviso viejo hablaba de otra fecha.
      const cambioElDia = c.diaDelMes !== undefined && c.diaDelMes !== propio.diaDelMes;

      const pago = await db.pagoRecurrente.update({
        where: { id: c.id },
        data: {
          ...(c.nombre !== undefined ? { nombre: c.nombre.trim() } : {}),
          ...(c.monto !== undefined ? { monto: c.monto } : {}),
          ...(c.moneda !== undefined ? { moneda: c.moneda.trim().toUpperCase() || "USD" } : {}),
          ...(c.diaDelMes !== undefined ? { diaDelMes: c.diaDelMes } : {}),
          ...(c.avisarDiasAntes !== undefined ? { avisarDiasAntes: c.avisarDiasAntes } : {}),
          ...(c.activo !== undefined ? { activo: c.activo } : {}),
          ...(c.notas !== undefined ? { notas: c.notas?.trim() || null } : {}),
          ...(cambioElDia ? { avisoPrevioEn: null, avisoDiaEn: null } : {}),
        },
      });
      return NextResponse.json({ ok: true, pago });
    }

    if (!c.nombre?.trim() || c.diaDelMes === undefined) {
      return NextResponse.json({ error: "Falta el nombre o el día de cobro." }, { status: 400 });
    }

    const pago = await db.pagoRecurrente.create({
      data: {
        organizationId: session.organizationId,
        nombre: c.nombre.trim(),
        monto: c.monto ?? null,
        moneda: (c.moneda ?? "USD").trim().toUpperCase() || "USD",
        diaDelMes: c.diaDelMes,
        avisarDiasAntes: c.avisarDiasAntes ?? 3,
        notas: c.notas?.trim() || null,
      },
    });
    return NextResponse.json({ ok: true, pago });
  } catch (err) {
    return NextResponse.json(
      { error: mensajeSeguro(err, "No se pudo guardar.") },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Esto lo lleva dirección." }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  // deleteMany y no delete: con el id de otra empresa borra cero filas en vez
  // de lanzar.
  const r = await db.pagoRecurrente.deleteMany({
    where: { id, organizationId: session.organizationId },
  });
  if (r.count === 0) return NextResponse.json({ error: "No existe ese pago." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
