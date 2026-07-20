import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ChangePasswordForm from "./change-password-form";

export default async function CambiarClavePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded p-8">
        <div className="mb-6">
          <p className="font-mono text-xs uppercase tracking-wide text-accent mb-2">Jarvis</p>
          <h1 className="text-2xl font-semibold">Elegí una contraseña</h1>
          <p className="text-sm text-muted mt-1">
            {session.mustChangePassword
              ? "Esta cuenta entró con una clave genérica — antes de seguir, elegí una propia."
              : `Cambiar la contraseña de ${session.email}.`}
          </p>
        </div>
        <ChangePasswordForm forced={session.mustChangePassword} />
      </div>
    </main>
  );
}
