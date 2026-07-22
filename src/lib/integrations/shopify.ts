// Cliente de la Shopify Admin API. Separado a propósito de meta.ts/tiktok.ts:
// Shopify no es una red publicitaria, es la tienda — de acá sale la vista
// "Ventas" (todo lo que se vende, se anuncie o no).
//
// Requiere una app personalizada (Shopify Admin → Configuración → Desarrollo
// de apps) con scopes read_orders y read_products, y su Admin API access
// token (empieza con shpat_). Sesiones y tasa de conversión reales NO están
// disponibles acá — son de la Shopify Analytics API, que requiere permisos
// aparte (Shopify Plus / ShopifyQL). Mientras tanto esos dos quedan con el
// valor de ejemplo.

const API_VERSION = "2024-10";

function normalizeShopDomain(shopDomain: string) {
  return shopDomain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function shopifyFetch(shopDomain: string, accessToken: string, path: string) {
  const url = `https://${normalizeShopDomain(shopDomain)}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Shopify API error (${path}): ${JSON.stringify(json.errors ?? json)}`);
  }
  return json;
}

export async function verifyShopifyConnection(shopDomain: string, accessToken: string) {
  const json = await shopifyFetch(shopDomain, accessToken, "/shop.json");
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
  accessToken: string,
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
  const json = await shopifyFetch(shopDomain, accessToken, `/orders.json?${params.toString()}`);
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
