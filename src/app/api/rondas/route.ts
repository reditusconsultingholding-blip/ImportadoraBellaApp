import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import { revisarRonda } from "@/lib/rondas";
import { nomenclaturaDeRonda } from "@/lib/nomenclatura";

// Rondas — el "lote de contenido" del que habla el equipo: un grupo de piezas
// que salen juntas a testear (4 para la matriz de diversidad; 6 o 12 cuando
// es un lote de producción). La verificación de diversidad vive del lado del
// servidor y viaja con la ronda. Si la hiciera la pantalla, el criterio
// estaría en dos lugares y tarde o temprano dirían cosas distintas.

const TAMANOS_LOTE = [4, 6, 12];

async function productoDeLaOrg(productId: string, organizationId: string) {
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, organizationId: true, code: true },
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
        nomenclatura: true,
        tamanoObjetivo: true,
        fechaEntrega: true,
        estado: true,
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

  const { productId, semana, notas, tamanoObjetivo, fechaEntrega } = (await req.json()) as {
    productId?: string;
    semana?: string;
    notas?: string;
    tamanoObjetivo?: number;
    fechaEntrega?: string;
  };

  const producto = productId ? await productoDeLaOrg(productId, session.organizationId) : null;
  if (!productId || !producto) {
    return NextResponse.json({ error: "Ese producto no existe." }, { status: 404 });
  }

  const tamano = TAMANOS_LOTE.includes(tamanoObjetivo as number) ? (tamanoObjetivo as number) : 12;

  // El número se calcula acá y no lo elige quien la crea: dos personas armando
  // rondas a la vez elegirían el mismo. La nomenclatura sale de ese mismo
  // número — es la clave que el editor copia al nombrar la campaña, y con la
  // que el sync la vuelve a encontrar (ver src/lib/nomenclatura.ts).
  const ultima = await db.ronda.findFirst({
    where: { organizationId: session.organizationId, productId },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });
  const numero = (ultima?.numero ?? 0) + 1;

  const ronda = await db.ronda.create({
    data: {
      organizationId: session.organizationId,
      productId,
      numero,
      semana: semana?.trim() || null,
      notas: notas?.trim() || null,
      responsableId: session.userId,
      nomenclatura: nomenclaturaDeRonda(producto.code, numero),
      tamanoObjetivo: tamano,
      fechaEntrega: fechaEntrega ? new Date(`${fechaEntrega}T00:00:00.000Z`) : null,
    },
    select: { id: true, numero: true, nomenclatura: true, tamanoObjetivo: true },
  });

  return NextResponse.json({ ok: true, ronda });
}

const RONDA_EDITABLE_FIELDS = ["estado", "fechaEntrega", "tamanoObjetivo", "semana", "notas"] as const;

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/** Edita los datos del lote en sí — estado, fecha de entrega, tamaño. */
async function editarRonda(session: Session, id: string, body: Record<string, unknown>) {
  const existing = await db.ronda.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!existing || existing.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Ese lote no existe." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  for (const field of RONDA_EDITABLE_FIELDS) {
    if (!(field in body)) continue;
    if (field === "fechaEntrega") {
      data.fechaEntrega = body.fechaEntrega ? new Date(`${body.fechaEntrega}T00:00:00.000Z`) : null;
    } else if (field === "tamanoObjetivo") {
      data.tamanoObjetivo = TAMANOS_LOTE.includes(body.tamanoObjetivo as number)
        ? body.tamanoObjetivo
        : 12;
    } else if (typeof body[field] === "string") {
      data[field] = (body[field] as string).trim() || null;
    }
  }

  const ronda = await db.ronda.update({ where: { id }, data });
  return NextResponse.json({ ok: true, ronda });
}

/** Mete o saca una pieza de una ronda, o edita los datos del lote. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Armar rondas es de dirección." }, { status: 403 });
  }

  const body = (await req.json()) as {
    id?: string;
    requirementId?: string;
    rondaId?: string | null;
    slot?: number | null;
  };

  // Dos formas de la misma ruta: {id, ...} edita el lote; {requirementId, ...}
  // mueve una pieza dentro o fuera de un lote.
  if (body.id && !body.requirementId) {
    return editarRonda(session, body.id, body as unknown as Record<string, unknown>);
  }

  const { requirementId, rondaId, slot } = body;
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
      select: {
        id: true,
        organizationId: true,
        productId: true,
        tamanoObjetivo: true,
        _count: { select: { piezas: true } },
      },
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
    if (ronda._count.piezas >= ronda.tamanoObjetivo) {
      return NextResponse.json(
        { error: `El lote ya tiene sus ${ronda.tamanoObjetivo} piezas.` },
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
