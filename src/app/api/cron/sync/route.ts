import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncAdAccount } from "@/lib/integrations/sync";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";

// Job periódico (Vercel Cron, ver vercel.json) que sincroniza todas las
// cuentas y tiendas ya conectadas — así los datos reales se actualizan
// solos, sin que alguien tenga que entrar a Conexiones y apretar
// "Sincronizar ahora".
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const accounts = await db.adAccount.findMany({ where: { accessToken: { not: null } } });
  const stores = await db.shopifyStore.findMany({ where: { accessToken: { not: null } } });

  const [adResults, shopifyResults] = await Promise.all([
    Promise.allSettled(accounts.map((a) => syncAdAccount(a.id))),
    Promise.allSettled(stores.map((s) => syncShopifyStore(s.id))),
  ]);
  const results = [...adResults, ...shopifyResults];

  return NextResponse.json({
    synced: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    total: accounts.length + stores.length,
  });
}
