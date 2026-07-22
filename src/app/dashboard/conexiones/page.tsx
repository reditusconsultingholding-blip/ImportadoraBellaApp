import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccountCard from "./account-card";
import AddAccountButton from "./add-account-button";
import ShopifyCard from "./shopify-card";
import CollapsibleSection from "./collapsible-section";

export default async function ConexionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [accounts, shopifyStore] = await Promise.all([
    db.adAccount.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
    }),
    db.shopifyStore.findFirst({ where: { organizationId: session.organizationId } }),
  ]);

  const metaAccounts = accounts.filter((a) => a.platform === "META");
  const tiktokAccounts = accounts.filter((a) => a.platform === "TIKTOK");

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Conexiones</h1>
        <p className="text-sm text-muted">
          Pegá acá el token de cada cuenta cuando lo tengas. Si tenés varias cuentas
          publicitarias por red, agregá una tarjeta por cada una. Mientras tanto, el
          panel sigue mostrando los datos de ejemplo.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Redes publicitarias
        </h2>

        <CollapsibleSection title="Meta (Facebook + Instagram)" count={metaAccounts.length}>
          {metaAccounts.map((account) => (
            <AccountCard
              key={account.id}
              id={account.id}
              platform={account.platform}
              name={account.name}
              externalId={account.externalId}
              connected={Boolean(account.connectedAt)}
            />
          ))}
          <AddAccountButton platform="META" />
        </CollapsibleSection>

        <CollapsibleSection title="TikTok" count={tiktokAccounts.length}>
          {tiktokAccounts.map((account) => (
            <AccountCard
              key={account.id}
              id={account.id}
              platform={account.platform}
              name={account.name}
              externalId={account.externalId}
              connected={Boolean(account.connectedAt)}
            />
          ))}
          <AddAccountButton platform="TIKTOK" />
        </CollapsibleSection>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Tienda &middot; independiente de las redes de anuncios
        </h2>

        <CollapsibleSection title="Shopify" count={shopifyStore ? 1 : 0}>
          <ShopifyCard
            store={
              shopifyStore
                ? {
                    id: shopifyStore.id,
                    shopDomain: shopifyStore.shopDomain,
                    connected: Boolean(shopifyStore.connectedAt),
                  }
                : null
            }
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}
