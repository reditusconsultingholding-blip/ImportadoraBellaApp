import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { fetchProductCatalog } from "@/lib/integrations/shopify";
import { normalizar } from "@/lib/product-code";
import { relinkCampaignsToProducts } from "@/lib/integrations/windsor-sync";

// El catálogo vivo de Shopify, para poder buscar un producto y empezar a
// seguirlo desde el panel. La caché de fetchProductCatalog es de 5 minutos:
// un producto recién creado en Shopify aparece aquí en ese plazo sin que nadie
// apriete nada.

/** Código interno a partir del título, cuando el producto no viene de una campaña. */
function codigoDesde(titulo: string) {
  const base = normalizar(titulo).replace(/\s+/g, "-").slice(0, 24);
  return base || "PRODUCTO";
}

async function tiendaDe(organizationId: string) {
  return db.shopifyStore.findFirst({
    where: { organizationId, connectedAt: { not: null } },
  });
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const tienda = await tiendaDe(session.organizationId);
  if (!tienda) {
    return NextResponse.json({ items: [], error: "No hay una tienda de Shopify conectada." });
  }

  const refrescar = req.nextUrl.searchParams.get("refrescar") === "1";

  let catalogo;
  try {
    catalogo = await fetchProductCatalog(tienda.shopDomain, tienda.accessToken, {
      refresh: refrescar,
    });
  } catch (err) {
    return NextResponse.json({
      items: [],
      error: `No se pudo leer el catálogo de Shopify: ${
        err instanceof Error ? err.message : "error desconocido"
      }`,
    });
  }

  // Cuáles ya se están siguiendo, para no ofrecer duplicados. Se compara por
  // nombre normalizado: el mismo producto puede estar cargado con acentos o
  // sin ellos.
  const seguidos = await db.product.findMany({
    where: { organizationId: session.organizationId },
    select: { id: true, code: true, name: true },
  });
  const yaSeguido = new Map(seguidos.map((p) => [normalizar(p.name), p]));

  const items = catalogo
    .map((c) => {
      const ficha = yaSeguido.get(normalizar(c.title));
      return {
        title: c.title,
        price: c.price,
        unitCost: c.unitCost,
        seguido: Boolean(ficha),
        code: ficha?.code ?? null,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "es"));

  return NextResponse.json({ items, total: items.length, tienda: tienda.shopDomain });
}

/** Empieza a seguir un producto del catálogo: le crea la ficha. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tienes permiso para crear productos." }, { status: 403 });
  }

  const { titles } = (await req.json()) as { titles?: string[] };
  const pedidos = (titles ?? []).map((t) => t?.trim()).filter(Boolean) as string[];
  if (pedidos.length === 0) {
    return NextResponse.json({ error: "No elegiste ningún producto." }, { status: 400 });
  }

  const tienda = await tiendaDe(session.organizationId);
  if (!tienda) {
    return NextResponse.json({ error: "No hay una tienda de Shopify conectada." }, { status: 409 });
  }

  const catalogo = await fetchProductCatalog(tienda.shopDomain, tienda.accessToken);
  const porTitulo = new Map(catalogo.map((c) => [normalizar(c.title), c]));

  const existentes = await db.product.findMany({
    where: { organizationId: session.organizationId },
    select: { code: true, name: true },
  });
  const codigosUsados = new Set(existentes.map((p) => p.code));
  const nombresUsados = new Set(existentes.map((p) => normalizar(p.name)));

  const creados: string[] = [];
  const omitidos: string[] = [];

  for (const titulo of pedidos) {
    const clave = normalizar(titulo);
    const enCatalogo = porTitulo.get(clave);
    if (!enCatalogo) {
      omitidos.push(`${titulo}: no está en el catálogo de Shopify.`);
      continue;
    }
    if (nombresUsados.has(clave)) {
      omitidos.push(`${titulo}: ya lo estás siguiendo.`);
      continue;
    }

    // Si el código ya existe se le agrega un sufijo. Colisiona poco, pero
    // dejar que reviente la restricción única a mitad del lote sería peor.
    let code = codigoDesde(enCatalogo.title);
    let n = 2;
    while (codigosUsados.has(code)) code = `${codigoDesde(enCatalogo.title)}-${n++}`;

    // El objetivo sale del margen cuando se conocen precio y costo; si no, se
    // deja un valor evidentemente provisorio y se dice en la ficha.
    const margen =
      enCatalogo.price != null && enCatalogo.unitCost != null && enCatalogo.price > enCatalogo.unitCost
        ? (enCatalogo.price - enCatalogo.unitCost) * 0.7
        : null;

    await db.product.create({
      data: {
        organizationId: session.organizationId,
        code,
        name: enCatalogo.title,
        cpaTarget: margen != null ? Math.round(margen * 100) / 100 : 10,
        salePrice: enCatalogo.price,
        unitCost: enCatalogo.unitCost,
        notes:
          margen != null
            ? "Se empezó a seguir desde el catálogo de Shopify. Precio y costo salen de la tienda."
            : "Se empezó a seguir desde el catálogo de Shopify. Falta el costo por artículo, así que el CPA objetivo es provisional.",
      },
    });
    codigosUsados.add(code);
    nombresUsados.add(clave);
    creados.push(enCatalogo.title);
  }

  // Al aparecer productos nuevos puede haber campañas que ahora sí cruzan.
  const { linked } = creados.length > 0
    ? await relinkCampaignsToProducts(session.organizationId)
    : { linked: 0 };

  return NextResponse.json({ ok: true, creados, omitidos, campanasVinculadas: linked });
}
