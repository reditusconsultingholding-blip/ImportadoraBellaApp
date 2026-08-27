import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron-auth";
import { syncAdAccount } from "@/lib/integrations/sync";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";
import { hasWindsorKey, type WindsorConnector } from "@/lib/integrations/windsor";
import { runAlertChecks } from "@/lib/alerts";

// Job periódico (servicio cron-sync en Railway, cada 15 minutos) que actualiza
// todo lo conectado, sin que nadie tenga que entrar a Conexiones a apretar
// "Sincronizar ahora".

const WINDSOR_CONNECTORS: WindsorConnector[] = ["facebook", "tiktok"];

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // Cuentas de Meta/TikTok con token propio: son las del camino viejo, de
  // antes de Windsor. Se siguen sincronizando por compatibilidad.
  const accounts = await db.adAccount.findMany({ where: { accessToken: { not: null } } });

  // Tiendas conectadas. NO se filtra por accessToken: cuando la conexión va
  // por la app de Shopify (client credentials) el token no se guarda, se pide
  // en cada llamada. Filtrar por token dejaba a esas tiendas sin sincronizar
  // jamás, en silencio.
  const stores = await db.shopifyStore.findMany({ where: { connectedAt: { not: null } } });

  const organizations = await db.organization.findMany({ select: { id: true } });

  const [adResults, shopifyResults, windsorResults] = await Promise.all([
    Promise.allSettled(accounts.map((a) => syncAdAccount(a.id))),
    Promise.allSettled(stores.map((s) => syncShopifyStore(s.id))),
    hasWindsorKey()
      ? Promise.allSettled(
          organizations.flatMap((org) =>
            WINDSOR_CONNECTORS.map((connector) => syncWindsorConnector(org.id, connector))
          )
        )
      : Promise.resolve([]),
  ]);

  const results = [...adResults, ...shopifyResults];

  // Después de sincronizar se revisan alertas, una vez por organización.
  const orgIds = Array.from(
    new Set([...accounts, ...stores].map((x) => x.organizationId))
  );
  const alertResults = await Promise.allSettled(orgIds.map((id) => runAlertChecks(id)));

  return NextResponse.json({
    synced: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    total: accounts.length + stores.length,
    windsor: {
      enabled: hasWindsorKey(),
      ok: windsorResults.filter((r) => r.status === "fulfilled").length,
      failed: windsorResults.filter((r) => r.status === "rejected").length,
      // El primer error se devuelve para que se vea en el log del cron sin
      // tener que entrar a la base.
      error:
        windsorResults.find((r) => r.status === "rejected") &&
        String((windsorResults.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)
          .slice(0, 300),
    },
    alertsChecked: orgIds.length,
    alertsFailed: alertResults.filter((r) => r.status === "rejected").length,
  });
}
