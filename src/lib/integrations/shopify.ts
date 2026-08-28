// Cliente de la Shopify Admin API. Separado a propósito de meta.ts/tiktok.ts:
// Shopify no es una red publicitaria, es la tienda — de aquí sale la vista
// "Ventas" (todo lo que se vende, se anuncie o no).
//
// Dos formas de autenticarse, en este orden de prioridad (patrón portado del
// sistema en producción "Jarvin Panal" — ver docs/REFERENCIA_SISTEMA_RAILWAY.md):
//
//  1. Token fijo de app personalizada (shpat_...): el que se pega en Conexiones,
//     o SHOPIFY_ADMIN_TOKEN si está seteado. Se usa tal cual.
//  2. SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET (app del Dev Dashboard):
//     client credentials grant contra /admin/oauth/access_token. Devuelve un
//     token temporal (~24h) que se cachea en memoria y se renueva 10 minutos
//     antes de vencer — no hay que rotar nada a mano.
//
// Sesiones y tasa de conversión reales NO están disponibles aquí — son de la
// Shopify Analytics API, que requiere permisos aparte (Shopify Plus / ShopifyQL).

const DEFAULT_API_VERSION = "2025-04";

function apiVersion() {
  return process.env.SHOPIFY_API_VERSION?.trim() || DEFAULT_API_VERSION;
}

function normalizeShopDomain(shopDomain: string) {
  return shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

// --- Autenticación --------------------------------------------------------

class ShopifyAuthError extends Error {}

type CachedToken = { token: string; expiresAt: number };

// Cache en memoria del token temporal, por tienda. Se pierde en cada arranque
// del proceso y eso está bien: pedir uno nuevo cuesta una sola llamada.
const tokenCache = new Map<string, CachedToken>();
const RENEW_MARGIN_MS = 10 * 60 * 1000;

export function hasShopifyAppCredentials() {
  return Boolean(process.env.SHOPIFY_CLIENT_ID?.trim() && process.env.SHOPIFY_CLIENT_SECRET?.trim());
}

async function fetchClientCredentialsToken(shop: string) {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Faltan SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET.");
  }

  const cached = tokenCache.get(shop);
  if (cached && cached.expiresAt - RENEW_MARGIN_MS > Date.now()) return cached.token;

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Shopify no entregó un token para ${shop} (${res.status}): ${
        json.error_description ?? json.error ?? "sin detalle"
      }`
    );
  }

  const ttlMs = Number(json.expires_in ?? 86400) * 1000;
  tokenCache.set(shop, { token: json.access_token, expiresAt: Date.now() + ttlMs });
  return json.access_token;
}

// Resuelve con qué token pegarle a la Admin API para esta tienda.
export async function resolveAccessToken(shopDomain: string, storedToken?: string | null) {
  const fixed = storedToken?.trim() || process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (fixed) return fixed;

  if (!hasShopifyAppCredentials()) {
    throw new Error(
      `La tienda "${shopDomain}" no tiene token conectado y tampoco hay SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET configurados.`
    );
  }
  return fetchClientCredentialsToken(normalizeShopDomain(shopDomain));
}

// --- Llamadas -------------------------------------------------------------

// Si el token temporal cacheado dejó de servir (401), lo tira y reintenta una
// vez. Con token fijo no reintenta: ahí el token está mal y hay que cambiarlo.
async function withAuth<T>(
  shopDomain: string,
  storedToken: string | null | undefined,
  call: (token: string) => Promise<T>
): Promise<T> {
  const shop = normalizeShopDomain(shopDomain);
  const token = await resolveAccessToken(shop, storedToken);
  try {
    return await call(token);
  } catch (err) {
    const usaTokenFijo = Boolean(storedToken?.trim() || process.env.SHOPIFY_ADMIN_TOKEN?.trim());
    if (!(err instanceof ShopifyAuthError) || usaTokenFijo) throw err;
    tokenCache.delete(shop);
    return call(await resolveAccessToken(shop, storedToken));
  }
}

async function shopifyFetch(shopDomain: string, token: string, path: string) {
  const url = `https://${normalizeShopDomain(shopDomain)}/admin/api/${apiVersion()}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) throw new ShopifyAuthError(`Shopify rechazó el token (${path}).`);
  if (!res.ok) {
    throw new Error(`Shopify API error (${path}): ${JSON.stringify(json.errors ?? json)}`);
  }
  return json;
}

async function shopifyGraphQL<T>(
  shopDomain: string,
  token: string,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const url = `https://${normalizeShopDomain(shopDomain)}/admin/api/${apiVersion()}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: unknown };
  if (res.status === 401) throw new ShopifyAuthError("Shopify rechazó el token (GraphQL).");
  if (!res.ok || json.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data as T;
}

export async function verifyShopifyConnection(shopDomain: string, storedToken?: string | null) {
  const json = await withAuth(shopDomain, storedToken, (token) =>
    shopifyFetch(shopDomain, token, "/shop.json")
  );
  return { shopName: json.shop?.name as string | undefined };
}

export type RemoteShopifyOrder = {
  externalId: string;
  occurredAt: string;
  clienteNombre: string | null;
  clienteTelefono: string | null;
  clienteEmail: string | null;
  provincia: string | null;
  ciudad: string | null;
  channel: string;
  grossSales: number;
  discounts: number;
  shipping: number;
  taxes: number;
  netSales: number;
  lineItems: { productName: string; quantity: number; amount: number }[];
};

const ORDERS_QUERY = `
  query($cursor: String, $q: String) {
    orders(first: 100, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        createdAt
        app { name }
        # A quien y a donde. Es lo que permite ver quien repite y en que
        # provincia se vende mejor. GraphQL comenta con almohadilla: un // acá
        # es un error de sintaxis que tumba TODA la sincronizacion de ventas.
        phone
        email
        customer { displayName phone email }
        shippingAddress { province city phone }
        currentSubtotalPriceSet { shopMoney { amount } }
        currentTotalDiscountsSet { shopMoney { amount } }
        currentTotalTaxSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        currentTotalPriceSet { shopMoney { amount } }
        lineItems(first: 100) {
          nodes { title quantity originalTotalSet { shopMoney { amount } } }
        }
      }
    }
  }
`;

type Money = { shopMoney: { amount: string } } | null;

type OrdersPage = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      id: string;
      createdAt: string;
      app: { name: string } | null;
      phone: string | null;
      email: string | null;
      customer: { displayName: string | null; phone: string | null; email: string | null } | null;
      shippingAddress: { province: string | null; city: string | null; phone: string | null } | null;
      currentSubtotalPriceSet: Money;
      currentTotalDiscountsSet: Money;
      currentTotalTaxSet: Money;
      totalShippingPriceSet: Money;
      currentTotalPriceSet: Money;
      lineItems: { nodes: { title: string; quantity: number; originalTotalSet: Money }[] };
    }[];
  };
};

const amount = (money: Money) => Number(money?.shopMoney.amount ?? 0);

// Tope de seguridad: 250 páginas de 100 son 25.000 órdenes por sincronización.
// Eran 50 (5.000) y quedaba corto: la tienda hace ~500 órdenes por día, así
// que un backfill de 30 días se truncaba en silencio a la mitad.
// Sin un tope, un error de fecha podría hacer que esto pagine la tienda entera.
const MAX_ORDER_PAGES = 250;

/**
 * Trae las órdenes creadas desde `sinceISO`.
 *
 * Va por GraphQL y no por la API REST por dos motivos que se descubrieron con
 * datos reales: REST corta en 250 por página y hay que paginar a mano por el
 * encabezado Link — sin eso el sync truncaba en silencio y parecía que la
 * tienda vendía menos de lo que vende. Y el `source_name` de REST devuelve el
 * ID numérico de la app (2820951), mientras que aquí `app.name` da el nombre
 * de verdad: "Funnelish", "Releasit COD Form".
 */
export async function fetchRecentOrders(
  shopDomain: string,
  storedToken: string | null | undefined,
  sinceISO: string,
  /**
   * Final de la ventana, opcional. Sin esto solo se puede pedir "desde
   * hace N dias hasta ahora", y rellenar un ano entero era una sola
   * peticion de noventa mil ordenes que se pasaba del tiempo del proxy.
   * Con un final se puede ir mes por mes.
   */
  untilISO?: string
): Promise<RemoteShopifyOrder[]> {
  const orders: RemoteShopifyOrder[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const page: OrdersPage = await withAuth(shopDomain, storedToken, (token) =>
      shopifyGraphQL<OrdersPage>(shopDomain, token, ORDERS_QUERY, {
        cursor,
        q: untilISO ? `created_at:>=${sinceISO} created_at:<=${untilISO}` : `created_at:>=${sinceISO}`,
      })
    );

    for (const node of page.orders.nodes) {
      orders.push({
        // El id de GraphQL viene como "gid://shopify/Order/123"; se guarda solo
        // el número, que es lo que ya había en la base.
        externalId: node.id.split("/").pop() ?? node.id,
        occurredAt: node.createdAt,
        // El telefono puede venir en la orden o en la ficha del cliente:
        // Funnelish y Releasit lo ponen en lugares distintos.
        clienteNombre: node.customer?.displayName?.trim() || null,
        clienteTelefono: (node.phone ?? node.customer?.phone)?.trim() || null,
        clienteEmail: (node.email ?? node.customer?.email)?.trim() || null,
        provincia: node.shippingAddress?.province?.trim() || null,
        ciudad: node.shippingAddress?.city?.trim() || null,
        channel: node.app?.name || "Tienda online",
        grossSales: amount(node.currentSubtotalPriceSet),
        discounts: amount(node.currentTotalDiscountsSet),
        shipping: amount(node.totalShippingPriceSet),
        taxes: amount(node.currentTotalTaxSet),
        netSales: amount(node.currentTotalPriceSet),
        lineItems: node.lineItems.nodes.map((li) => ({
          productName: li.title,
          quantity: li.quantity,
          amount: amount(li.originalTotalSet),
        })),
      });
    }

    cursor = page.orders.pageInfo.hasNextPage ? page.orders.pageInfo.endCursor : null;
  } while (cursor && ++pages < MAX_ORDER_PAGES);

  return orders;
}

// --- Catálogo con costo unitario real ------------------------------------
//
// Esto es lo que autocompleta precio y costo en la calculadora sin que nadie
// los tipee a mano: `unitCost` es el costo por artículo que ya está cargado en
// Shopify. Portado del Sistema B (ver docs/REFERENCIA_SISTEMA_RAILWAY.md).

export type ShopifyCatalogProduct = {
  title: string;
  price: number | null;
  unitCost: number | null;
};

// 5 minutos: es lo que se tarda en ver en el buscador un producto que alguien
// acaba de crear en Shopify. Traer las fichas activas son dos consultas, asi
// que refrescar seguido no cuesta casi nada.
const CATALOG_TTL_MS = 5 * 60 * 1000;
const catalogCache = new Map<string, { at: number; products: ShopifyCatalogProduct[] }>();

const CATALOG_QUERY = `
  query($cursor: String) {
    products(first: 250, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        title
        variants(first: 1) {
          nodes { price inventoryItem { unitCost { amount } } }
        }
      }
    }
  }
`;

type CatalogPage = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: {
      title: string;
      variants: {
        nodes: {
          price: string | null;
          inventoryItem?: { unitCost?: { amount: string | null } | null } | null;
        }[];
      };
    }[];
  };
};

export async function fetchProductCatalog(
  shopDomain: string,
  storedToken?: string | null,
  options: { refresh?: boolean } = {}
): Promise<ShopifyCatalogProduct[]> {
  const shop = normalizeShopDomain(shopDomain);
  const cached = catalogCache.get(shop);
  if (!options.refresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) {
    return cached.products;
  }

  const products: ShopifyCatalogProduct[] = [];
  let cursor: string | null = null;

  // Paginado por cursor: 250 por página hasta que Shopify diga que no hay más.
  do {
    const page: CatalogPage = await withAuth(shop, storedToken, (token) =>
      shopifyGraphQL<CatalogPage>(shop, token, CATALOG_QUERY, { cursor })
    );
    for (const node of page.products.nodes) {
      const variant = node.variants.nodes[0];
      const price = variant?.price != null ? Number(variant.price) : null;
      const cost = variant?.inventoryItem?.unitCost?.amount;
      products.push({
        title: node.title,
        price: price != null && Number.isFinite(price) ? price : null,
        unitCost: cost != null && Number.isFinite(Number(cost)) ? Number(cost) : null,
      });
    }
    cursor = page.products.pageInfo.hasNextPage ? page.products.pageInfo.endCursor : null;
  } while (cursor);

  catalogCache.set(shop, { at: Date.now(), products });
  return products;
}
