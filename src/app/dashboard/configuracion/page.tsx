import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import AccountSettings from "./account-settings";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Administrador",
  DIRECTOR: "Director operativo",
  EDITOR: "Editor / Creador",
  PENDING: "Pendiente de rol",
};

export default async function ConfiguracionPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { email: true, name: true, role: true, employee: { select: { position: true } } },
  });
  if (!me) redirect("/login");

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div>
        <h1 className="text-xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-muted">
          Entraste con un correo genérico que te asignaron. Cambialo por el tuyo cuando quieras — es
          con el que vas a iniciar sesión de ahí en adelante.
        </p>
      </div>

      <div className="bg-surface border border-border rounded p-5">
        <p className="font-medium">{me.name}</p>
        <p className="text-sm text-muted">
          {ROLE_LABEL[me.role] ?? me.role}
          {me.employee?.position ? ` · ${me.employee.position}` : ""}
        </p>
      </div>

      <AccountSettings currentEmail={me.email} />
    </div>
  );
}
