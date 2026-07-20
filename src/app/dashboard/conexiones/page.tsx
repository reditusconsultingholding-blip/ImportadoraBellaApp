import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccountCard from "./account-card";

export default async function ConexionesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const accounts = await db.adAccount.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { platform: "asc" },
  });

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">Conexiones</h1>
        <p className="text-sm text-muted">
          Pegá acá el token de cada cuenta cuando lo tengas. Mientras tanto, el panel sigue
          mostrando los datos de ejemplo.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            id={account.id}
            platform={account.platform}
            name={account.name}
            externalId={account.externalId}
            connected={Boolean(account.connectedAt)}
          />
        ))}
      </div>
    </div>
  );
}
