import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ChangePasswordForm from "./change-password-form";

export default async function CambiarClavePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-navy px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded p-8">
        <div className="mb-6">
          <p className="font-bold uppercase tracking-wide text-sm text-foreground leading-tight">Importadora</p>
          <p className="font-serif italic text-3xl leading-tight -mt-1 text-foreground">Bella</p>
          <p className="font-mono text-xs uppercase tracking-wide text-accent mt-2 mb-2">Jarvis</p>
          <h1 className="text-2xl font-semibold">Elige una contraseña</h1>
          <p className="text-sm text-muted mt-1">
            {session.mustChangePassword
              ? "Esta cuenta entró con una clave genérica — antes de seguir, elige una propia."
              : `Cambiar la contraseña de ${session.email}.`}
          </p>
        </div>
        <ChangePasswordForm forced={session.mustChangePassword} />
      </div>
    </main>
  );
}
