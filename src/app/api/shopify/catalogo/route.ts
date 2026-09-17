import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { veLasCifras } from "@/lib/finanzas";
import { fetchProductCatalog, type ShopifyCatalogProduct } from "@/lib/integrations/shopify";

// El catálogo completo de la tienda, para el selector de la calculadora.
//
// La calculadora lo pide al abrir y cada dos minutos, para que un producto
// recién creado en Shopify aparezca sin que nadie recargue nada. Eso obliga a
// una caché propia: `fetchProductCatalog` ya tiene una de cinco minutos, así
// que sin esto un producto nuevo podía tardar ese tiempo en aparecer —y
// forzar el refresco en cada consulta sería paginar los 500 productos de la
// tienda una vez cada dos minutos por cada persona que tenga la pantalla
// abierta.
//
// Con esta caché, el costo es UNA lectura de Shopify cada dos minutos para
// toda la organización, mire quien mire.

const FRESCURA_MS = 2 * 60 * 1000;

type Entrada = { at: number; productos: ShopifyCatalogProduct[]; tienda: string };
const cache = new Map<string, Entrada>();

/** Una lectura en curso por organización: diez pestañas abiertas no son diez viajes. */
const enVuelo = new Map<string, Promise<Entrada>>();

async function leerCatalogo(organizationId: string, forzar: boolean): Promise<Entrada> {
  const guardado = cache.get(organizationId);
  if (!forzar && guardado && Date.now() - guardado.at < FRESCURA_MS) return guardado;

  const yaPedido = enVuelo.get(organizationId);
  if (yaPedido) return yaPedido;

  const tarea = (async () => {
    const store = await db.shopifyStore.findFirst({
      where: { organizationId, connectedAt: { not: null } },
      select: { shopDomain: true, accessToken: true },
    });
    if (!store) throw new Error("No hay una tienda de Shopify conectada.");

    const productos = await fetchProductCatalog(store.shopDomain, store.accessToken, {
      refresh: true,
    });
    const entrada: Entrada = { at: Date.now(), productos, tienda: store.shopDomain };
    cache.set(organizationId, entrada);
    return entrada;
  })();

  enVuelo.set(organizationId, tarea);
  try {
    return await tarea;
  } finally {
    enVuelo.delete(organizationId);
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role) || !(await veLasCifras(session.userId))) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const forzar = req.nextUrl.searchParams.get("refrescar") === "1";

  try {
    const { productos, at, tienda } = await leerCatalogo(session.organizationId, forzar);
    return NextResponse.json(
      {
        tienda,
        actualizadoEn: new Date(at).toISOString(),
        total: productos.length,
        productos: productos.map((p) => ({
          id: p.id,
          titulo: p.title,
          precio: p.price,
          costo: p.unitCost,
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    // Que falle el catálogo no puede dejar la calculadora inservible: devuelve
    // el error con 200 para que la pantalla siga andando con lo que ya tenía y
    // muestre el aviso, en vez de quedarse en blanco.
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "No se pudo leer el catálogo de Shopify.",
        productos: [],
        total: 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
