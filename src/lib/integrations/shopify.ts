// Cliente de la Shopify Admin API. Separado a propósito de meta.ts/tiktok.ts:
// Shopify no es una red publicitaria, es la tienda — de acá sale la vista
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
// Sesiones y tasa de conversión reales NO están disponibles acá — son de la
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
  channel: string;
  grossSales: number;
  discounts: number;
  shipping: number;
  taxes: number;
  netSales: number;
  lineItems: { productName: string; quantity: number; amount: number }[];
};

export async function fetchRecentOrders(
  shopDomain: string,
  storedToken: string | null | undefined,
  sinceISO: string
): Promise<RemoteShopifyOrder[]> {
  type Money = { shop_money: { amount: string } };
  type Line = { title: string; quantity: number; price: string };
  type Order = {
    id: number;
    created_at: string;
    source_name: string | null;
    subtotal_price: string;
    total_discounts: string;
    total_tax: string;
    total_shipping_price_set?: Money;
    total_price: string;
    line_items: Line[];
  };

  const params = new URLSearchParams({
    status: "any",
    created_at_min: sinceISO,
    limit: "250",
  });
  const json = await withAuth(shopDomain, storedToken, (token) =>
    shopifyFetch(shopDomain, token, `/orders.json?${params.toString()}`)
  );
  const orders = (json.orders ?? []) as Order[];

  return orders.map((o) => ({
    externalId: String(o.id),
    occurredAt: o.created_at,
    channel: o.source_name || "Online Store",
    grossSales: Number(o.subtotal_price ?? 0),
    discounts: Number(o.total_discounts ?? 0),
    shipping: Number(o.total_shipping_price_set?.shop_money.amount ?? 0),
    taxes: Number(o.total_tax ?? 0),
    netSales: Number(o.total_price ?? 0),
    lineItems: (o.line_items ?? []).map((li) => ({
      productName: li.title,
      quantity: li.quantity,
      amount: Number(li.price ?? 0) * li.quantity,
    })),
  }));
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

const CATALOG_TTL_MS = 10 * 60 * 1000;
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
