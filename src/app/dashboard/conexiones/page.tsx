import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { db } from "@/lib/db";
import AccountCard from "./account-card";
import AddAccountButton from "./add-account-button";
import ShopifyCard from "./shopify-card";
import DropiCard from "./dropi-card";
import NotionCard from "./notion-card";
import CollapsibleSection from "./collapsible-section";
import CorreoCard from "./correo-card";
import { emailConfigured, estadoDelCorreo } from "@/lib/email";
import { hasShopifyAppCredentials } from "@/lib/integrations/shopify";
import { EncabezadoSeccion } from "../encabezado-seccion";

export default async function ConexionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Esta pantalla guarda los tokens de produccion. Antes solo pedia sesion.
  if (!canManageConexiones(session.role)) redirect("/dashboard");

  const [accounts, shopifyStore, dropiConnection, notionConnection, estadoCorreo] = await Promise.all([
    db.adAccount.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "asc" },
    }),
    db.shopifyStore.findFirst({ where: { organizationId: session.organizationId } }),
    db.dropiConnection.findFirst({ where: { organizationId: session.organizationId } }),
    db.notionConnection.findUnique({ where: { organizationId: session.organizationId } }),
    estadoDelCorreo(),
  ]);

  const metaAccounts = accounts.filter((a) => a.platform === "META");
  const tiktokAccounts = accounts.filter((a) => a.platform === "TIKTOK");

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <EncabezadoSeccion
        eyebrow="Cuenta"
        titulo="Conexiones"
        descripcion="Pegá aquí el token de cada cuenta cuando lo tengas. Si tienes varias cuentas publicitarias por red, agrega una tarjeta por cada una. Mientras tanto, el panel sigue mostrando los datos de ejemplo."
      />

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
            appCredentials={hasShopifyAppCredentials()}
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

      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Logística &middot; torre de envíos Ecuador
        </h2>

        <CollapsibleSection title="Dropi" count={dropiConnection?.integrationKey ? 1 : 0}>
          <DropiCard
            connection={
              dropiConnection
                ? {
                    hasKey: Boolean(dropiConnection.integrationKey),
                    connectedAt: dropiConnection.connectedAt?.toISOString() ?? null,
                  }
                : null
            }
          />
        </CollapsibleSection>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Correo saliente</h2>

        <CollapsibleSection title="Resend" count={emailConfigured() ? 1 : 0}>
          {/* El estado se le pregunta a Resend, no se adivina de una variable:
              con el dominio sin verificar, los correos salen del remitente de
              prueba y solo los recibe el dueño de la cuenta. */}
          <CorreoCard configurado={emailConfigured()} dominio={estadoCorreo.dominio} />
        </CollapsibleSection>
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Migración &middot; traer datos de otra herramienta
        </h2>

        <CollapsibleSection title="Notion" count={notionConnection?.connectedAt ? 1 : 0}>
          <NotionCard
            conectado={Boolean(notionConnection?.connectedAt)}
            lastImportAt={notionConnection?.lastImportAt?.toISOString() ?? null}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
}
