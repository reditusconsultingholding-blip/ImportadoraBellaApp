import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";

// El repositorio de dirección creativa de un producto: carpetas, links y notas.
//
// Es donde vive el material del que sale un anuncio. Antes eso estaba repartido
// entre Drive, el chat y la cabeza de quien lo produjo, y cada pieza nueva
// empezaba de cero buscando de qué partir.

const TIPOS = new Set(["CARPETA", "LINK", "NOTA"]);

// Solo http y https. Un link con "javascript:" sería un clic ejecutando código
// en la sesión de otra persona.
function urlValida(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

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

  // Se trae el árbol entero de una sola vez y se arma en el navegador: son
  // decenas de nodos, no miles, y pedir cada carpeta al abrirla se sentiría
  // lento sin ninguna ganancia.
  const assets = await db.productAsset.findMany({
    where: { productId },
    orderBy: [{ kind: "asc" }, { title: "asc" }],
    select: {
      id: true,
      parentId: true,
      kind: true,
      title: true,
      url: true,
      notes: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ assets, puedeEditar: canManagePipeline(session.role) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { productId, parentId, kind, title, url, notes } = (await req.json()) as {
    productId?: string;
    parentId?: string | null;
    kind?: string;
    title?: string;
    url?: string;
    notes?: string;
  };

  if (!productId || !(await productoDeLaOrg(productId, session.organizationId))) {
    return NextResponse.json({ error: "Ese producto no existe." }, { status: 404 });
  }
  if (!kind || !TIPOS.has(kind)) {
    return NextResponse.json({ error: "Tipo desconocido." }, { status: 400 });
  }
  const limpio = title?.trim();
  if (!limpio) return NextResponse.json({ error: "Ponle un nombre." }, { status: 400 });

  const destino = url?.trim();
  if (kind === "LINK") {
    if (!destino) return NextResponse.json({ error: "Falta el link." }, { status: 400 });
    if (!urlValida(destino)) {
      return NextResponse.json(
        { error: "El link tiene que empezar con http:// o https://." },
        { status: 400 }
      );
    }
  }

  // La carpeta madre tiene que ser del mismo producto: si no, se podría colgar
  // material de un producto dentro de otro.
  if (parentId) {
    const madre = await db.productAsset.findUnique({
      where: { id: parentId },
      select: { productId: true, kind: true },
    });
    if (!madre || madre.productId !== productId || madre.kind !== "CARPETA") {
      return NextResponse.json({ error: "Esa carpeta no existe." }, { status: 400 });
    }
  }

  const asset = await db.productAsset.create({
    data: {
      organizationId: session.organizationId,
      productId,
      parentId: parentId ?? null,
      kind,
      title: limpio.slice(0, 160),
      url: kind === "LINK" ? destino : null,
      notes: notes?.trim().slice(0, 4000) || null,
      createdById: session.userId,
    },
    select: {
      id: true,
      parentId: true,
      kind: true,
      title: true,
      url: true,
      notes: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ ok: true, asset });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el elemento." }, { status: 400 });

  const asset = await db.productAsset.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      organizationId: true,
      createdById: true,
      _count: { select: { children: true } },
    },
  });
  if (!asset || asset.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Ese elemento no existe." }, { status: 404 });
  }

  // Lo borra quien lo subió o alguien de dirección: si solo pudiera el autor,
  // el material de alguien que se fue del equipo quedaría trabado para siempre.
  const puede = asset.createdById === session.userId || canManagePipeline(session.role);
  if (!puede) {
    return NextResponse.json({ error: "Eso no lo subiste tú." }, { status: 403 });
  }

  await db.productAsset.delete({ where: { id } });
  return NextResponse.json({ ok: true, hijosBorrados: asset._count.children });
}
