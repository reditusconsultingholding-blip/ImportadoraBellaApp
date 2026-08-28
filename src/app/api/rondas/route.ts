import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { revisarRonda } from "@/lib/rondas";

// Rondas: cuatro piezas que salen juntas a testear.
//
// La verificación de diversidad vive del lado del servidor y viaja con la
// ronda. Si la hiciera la pantalla, el criterio estaría en dos lugares y tarde
// o temprano dirían cosas distintas.

async function productoDeLaOrg(productId: string, organizationId: string) {
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, organizationId: true },
  });
  return p && p.organizationId === organizationId ? p : null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const productId = req.nextUrl.searchParams.get("productId");
  if (!productId || !(await productoDeLaOrg(productId, session.organizationId))) {
    return NextResponse.json({ error: "Ese producto no existe." }, { status: 404 });
  }

  const [rondas, sueltas] = await Promise.all([
    db.ronda.findMany({
      where: { organizationId: session.organizationId, productId },
      orderBy: { numero: "desc" },
      select: {
        id: true,
        numero: true,
        semana: true,
        fecha: true,
        notas: true,
        responsable: { select: { id: true, name: true } },
        piezas: {
          orderBy: { slot: "asc" },
          select: {
            id: true,
            adName: true,
            slot: true,
            visualFormat: true,
            angle: true,
            awarenessLevel: true,
            status: true,
            estado: true,
            hookRate: true,
            cpa: true,
          },
        },
      },
    }),
    // Piezas del producto que todavía no están en ninguna ronda: son las que
    // se pueden meter en una.
    db.requirement.findMany({
      where: { organizationId: session.organizationId, productId, rondaId: null },
      orderBy: { date: "desc" },
      take: 200,
      select: {
        id: true,
        adName: true,
        visualFormat: true,
        angle: true,
        awarenessLevel: true,
      },
    }),
  ]);

  return NextResponse.json({
    rondas: rondas.map((r) => ({
      ...r,
      revision: revisarRonda(
        r.piezas.map((p) => ({
          id: p.id,
          adName: p.adName,
          slot: p.slot,
          visualFormat: p.visualFormat,
          angle: p.angle,
          awarenessLevel: p.awarenessLevel,
        }))
      ),
    })),
    sueltas,
    puedeEditar: canManagePipeline(session.role),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Armar rondas es de dirección." }, { status: 403 });
  }

  const { productId, semana, notas } = (await req.json()) as {
    productId?: string;
    semana?: string;
    notas?: string;
  };

  if (!productId || !(await productoDeLaOrg(productId, session.organizationId))) {
    return NextResponse.json({ error: "Ese producto no existe." }, { status: 404 });
  }

  // El número se calcula acá y no lo elige quien la crea: dos personas armando
  // rondas a la vez elegirían el mismo.
  const ultima = await db.ronda.findFirst({
    where: { organizationId: session.organizationId, productId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });

  const ronda = await db.ronda.create({
    data: {
      organizationId: session.organizationId,
      productId,
      numero: (ultima?.numero ?? 0) + 1,
      semana: semana?.trim() || null,
      notas: notas?.trim() || null,
      responsableId: session.userId,
    },
    select: { id: true, numero: true },
  });

  return NextResponse.json({ ok: true, ronda });
}

/** Mete o saca una pieza de una ronda. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Armar rondas es de dirección." }, { status: 403 });
  }

  const { requirementId, rondaId, slot } = (await req.json()) as {
    requirementId?: string;
    rondaId?: string | null;
    slot?: number | null;
  };

  if (!requirementId) {
    return NextResponse.json({ error: "Falta la pieza." }, { status: 400 });
  }

  const pieza = await db.requirement.findUnique({
    where: { id: requirementId },
    select: { id: true, organizationId: true, productId: true },
  });
  if (!pieza || pieza.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Esa pieza no existe." }, { status: 404 });
  }

  if (rondaId) {
    const ronda = await db.ronda.findUnique({
      where: { id: rondaId },
      select: { id: true, organizationId: true, productId: true, _count: { select: { piezas: true } } },
    });
    if (!ronda || ronda.organizationId !== session.organizationId) {
      return NextResponse.json({ error: "Esa ronda no existe." }, { status: 404 });
    }
    // La pieza y la ronda tienen que ser del mismo producto: una ronda mezcla
    // ángulos, no productos.
    if (ronda.productId !== pieza.productId) {
      return NextResponse.json(
        { error: "Esa pieza es de otro producto." },
        { status: 400 }
      );
    }
    if (ronda._count.piezas >= 4) {
      return NextResponse.json(
        { error: "La ronda ya tiene sus cuatro piezas." },
        { status: 409 }
      );
    }
  }

  await db.requirement.update({
    where: { id: requirementId },
    data: {
      rondaId: rondaId ?? null,
      slot: rondaId ? (slot ?? null) : null,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Armar rondas es de dirección." }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta la ronda." }, { status: 400 });

  const ronda = await db.ronda.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!ronda || ronda.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Esa ronda no existe." }, { status: 404 });
  }

  // Las piezas NO se borran: quedan sueltas y se pueden reasignar. Borrar
  // trabajo hecho porque se deshizo un agrupamiento sería absurdo.
  await db.requirement.updateMany({ where: { rondaId: id }, data: { rondaId: null, slot: null } });
  await db.ronda.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
