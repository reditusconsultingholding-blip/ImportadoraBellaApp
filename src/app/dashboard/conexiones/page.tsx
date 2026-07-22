import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccountCard from "./account-card";
import AddAccountButton from "./add-account-button";

export default async function ConexionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const accounts = await db.adAccount.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "asc" },
  });

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
          Meta (Facebook + Instagram)
        </h2>
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
      </div>

      <div className="flex flex-col gap-4">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">TikTok</h2>
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
      </div>
    </div>
  );
}
