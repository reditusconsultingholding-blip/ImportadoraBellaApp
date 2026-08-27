import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncAdAccount } from "@/lib/integrations/sync";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { runAlertChecks } from "@/lib/alerts";

// Job periódico (Vercel Cron, ver vercel.json) que sincroniza todas las
// cuentas y tiendas ya conectadas — así los datos reales se actualizan
// solos, sin que alguien tenga que entrar a Conexiones y apretar
// "Sincronizar ahora".
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const accounts = await db.adAccount.findMany({ where: { accessToken: { not: null } } });
  const stores = await db.shopifyStore.findMany({ where: { accessToken: { not: null } } });

  const [adResults, shopifyResults] = await Promise.all([
    Promise.allSettled(accounts.map((a) => syncAdAccount(a.id))),
    Promise.allSettled(stores.map((s) => syncShopifyStore(s.id))),
  ]);
  const results = [...adResults, ...shopifyResults];

  // Después de sincronizar, se revisan alertas por cada organización que
  // tenga algo conectado — una vez por org, no una vez por cuenta.
  const orgIds = Array.from(new Set([...accounts, ...stores].map((x) => x.organizationId)));
  const alertResults = await Promise.allSettled(orgIds.map((id) => runAlertChecks(id)));

  return NextResponse.json({
    synced: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    total: accounts.length + stores.length,
    alertsChecked: orgIds.length,
    alertsFailed: alertResults.filter((r) => r.status === "rejected").length,
  });
}
