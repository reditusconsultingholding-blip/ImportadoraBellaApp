import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

// Un solo endpoint para todo el tablero de Productos. Los tres tipos de
// tarjeta (carpeta, producto, nota) se crean, mueven y borran igual, así que
// tenerlos en tres archivos casi idénticos solo multiplicaría el lugar donde
// olvidarse de validar la organización.

type Kind = "folder" | "product" | "note";
const KINDS: Kind[] = ["folder", "product", "note"];

function isKind(value: unknown): value is Kind {
  return typeof value === "string" && KINDS.includes(value as Kind);
}

// Toda operación confirma que la tarjeta pertenece a la organización de quien
// la pide. Sin esto, conocer un id de otra organización alcanzaría para
// editarla.
async function belongsToOrg(kind: Kind, id: string, organizationId: string) {
  if (kind === "folder") {
    const row = await db.productFolder.findUnique({ where: { id }, select: { organizationId: true } });
    return row?.organizationId === organizationId;
  }
  if (kind === "product") {
    const row = await db.product.findUnique({ where: { id }, select: { organizationId: true } });
    return row?.organizationId === organizationId;
  }
  const row = await db.boardNote.findUnique({ where: { id }, select: { organizationId: true } });
  return row?.organizationId === organizationId;
}

async function assertFolderInOrg(folderId: string | null, organizationId: string) {
  if (!folderId) return true;
  const row = await db.productFolder.findUnique({
    where: { id: folderId },
    select: { organizationId: true },
  });
  return row?.organizationId === organizationId;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tenés permiso para editar el catálogo." }, { status: 403 });
  }

  const body = (await req.json()) as {
    kind?: string;
    folderId?: string | null;
    name?: string;
    title?: string;
    code?: string;
    cpaTarget?: number;
    salePrice?: number;
    unitCost?: number;
    notes?: string;
    body?: string;
    color?: string;
    positionX?: number;
    positionY?: number;
  };

  if (!isKind(body.kind)) {
    return NextResponse.json({ error: "Tipo de tarjeta inválido." }, { status: 400 });
  }

  const folderId = body.folderId ?? null;
  if (!(await assertFolderInOrg(folderId, session.organizationId))) {
    return NextResponse.json({ error: "Carpeta no encontrada." }, { status: 404 });
  }

  const positionX = Number.isFinite(body.positionX) ? (body.positionX as number) : 40;
  const positionY = Number.isFinite(body.positionY) ? (body.positionY as number) : 40;

  if (body.kind === "folder") {
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Ponele un nombre a la carpeta." }, { status: 400 });

    const folder = await db.productFolder.create({
      data: {
        organizationId: session.organizationId,
        name,
        parentId: folderId,
        color: body.color?.trim() || null,
        positionX,
        positionY,
      },
    });
    return NextResponse.json({ ok: true, id: folder.id });
  }

  if (body.kind === "product") {
    const name = body.name?.trim();
    const code = body.code?.trim().toUpperCase();
    if (!name || !code) {
      return NextResponse.json({ error: "El producto necesita nombre y código." }, { status: 400 });
    }

    const existing = await db.product.findFirst({
      where: { organizationId: session.organizationId, code },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Ya hay un producto con el código ${code}.` },
        { status: 409 }
      );
    }

    const product = await db.product.create({
      data: {
        organizationId: session.organizationId,
        code,
        name,
        // El CPA objetivo se puede afinar después; arrancar en 0 sería peor
        // que un valor evidentemente provisorio.
        cpaTarget: Number.isFinite(body.cpaTarget) ? (body.cpaTarget as number) : 10,
        salePrice: Number.isFinite(body.salePrice) ? (body.salePrice as number) : null,
        unitCost: Number.isFinite(body.unitCost) ? (body.unitCost as number) : null,
        notes: body.notes?.trim() || null,
        folderId,
        positionX,
        positionY,
      },
    });
    return NextResponse.json({ ok: true, id: product.id });
  }

  // Una ficha necesita al menos un título: es lo que se lee en el tablero.
  // El brief puede quedar para después.
  const title = body.title?.trim();
  const text = body.body?.trim() || "Sin brief todavía.";
  if (!title) {
    return NextResponse.json({ error: "Ponele un título a la ficha." }, { status: 400 });
  }

  const note = await db.boardNote.create({
    data: {
      organizationId: session.organizationId,
      folderId,
      title,
      body: text,
      color: body.color?.trim() || null,
      positionX,
      positionY,
    },
  });
  return NextResponse.json({ ok: true, id: note.id });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tenés permiso para editar el catálogo." }, { status: 403 });
  }

  const body = (await req.json()) as {
    kind?: string;
    id?: string;
    positionX?: number;
    positionY?: number;
    name?: string;
    body?: string;
    color?: string;
    cpaTarget?: number;
    salePrice?: number;
    unitCost?: number;
    notes?: string;
    // null mueve la tarjeta a la raíz; undefined la deja donde está.
    folderId?: string | null;
  };

  if (!isKind(body.kind) || !body.id) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  if (!(await belongsToOrg(body.kind, body.id, session.organizationId))) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }
  if (body.folderId !== undefined && !(await assertFolderInOrg(body.folderId, session.organizationId))) {
    return NextResponse.json({ error: "Carpeta no encontrada." }, { status: 404 });
  }

  const position = {
    ...(Number.isFinite(body.positionX) ? { positionX: body.positionX as number } : {}),
    ...(Number.isFinite(body.positionY) ? { positionY: body.positionY as number } : {}),
  };

  if (body.kind === "folder") {
    // Una carpeta no puede meterse dentro de sí misma ni de su descendencia:
    // quedaría un ciclo y el tablero no la mostraría nunca más.
    if (body.folderId !== undefined && body.folderId !== null) {
      if (body.folderId === body.id) {
        return NextResponse.json({ error: "Una carpeta no puede contenerse a sí misma." }, { status: 400 });
      }
      let cursor: string | null = body.folderId;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        if (cursor === body.id) {
          return NextResponse.json(
            { error: "No podés mover una carpeta dentro de una de sus subcarpetas." },
            { status: 400 }
          );
        }
        const parent: { parentId: string | null } | null = await db.productFolder.findUnique({
          where: { id: cursor },
          select: { parentId: true },
        });
        cursor = parent?.parentId ?? null;
      }
    }

    await db.productFolder.update({
      where: { id: body.id },
      data: {
        ...position,
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(body.color !== undefined ? { color: body.color?.trim() || null } : {}),
        ...(body.folderId !== undefined ? { parentId: body.folderId } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.kind === "product") {
    await db.product.update({
      where: { id: body.id },
      data: {
        ...position,
        ...(body.name?.trim() ? { name: body.name.trim() } : {}),
        ...(Number.isFinite(body.cpaTarget) ? { cpaTarget: body.cpaTarget as number } : {}),
        ...(body.salePrice !== undefined
          ? { salePrice: Number.isFinite(body.salePrice) ? (body.salePrice as number) : null }
          : {}),
        ...(body.unitCost !== undefined
          ? { unitCost: Number.isFinite(body.unitCost) ? (body.unitCost as number) : null }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
        ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  await db.boardNote.update({
    where: { id: body.id },
    data: {
      ...position,
      ...(body.body?.trim() ? { body: body.body.trim() } : {}),
      ...(body.color !== undefined ? { color: body.color?.trim() || null } : {}),
      ...(body.folderId !== undefined ? { folderId: body.folderId } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tenés permiso para editar el catálogo." }, { status: 403 });
  }

  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  if (!isKind(kind) || !id) {
    return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
  }
  if (!(await belongsToOrg(kind, id, session.organizationId))) {
    return NextResponse.json({ error: "No encontrado." }, { status: 404 });
  }

  if (kind === "folder") {
    // Los productos de la carpeta NO se borran: vuelven a la raíz. Perder un
    // producto (con sus campañas y su historial colgando) por borrar una
    // carpeta sería un desastre difícil de deshacer.
    await db.product.updateMany({ where: { folderId: id }, data: { folderId: null } });
    await db.productFolder.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  if (kind === "product") {
    const campaigns = await db.campaign.count({ where: { productId: id } });
    if (campaigns > 0) {
      return NextResponse.json(
        {
          error:
            "Este producto tiene campañas asociadas. Archivalo en vez de borrarlo para no perder el histórico.",
        },
        { status: 409 }
      );
    }
    const requirements = await db.requirement.count({ where: { productId: id } });
    if (requirements > 0) {
      return NextResponse.json(
        { error: "Este producto tiene piezas en el pipeline. Archivalo en vez de borrarlo." },
        { status: 409 }
      );
    }
    await db.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  await db.boardNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
