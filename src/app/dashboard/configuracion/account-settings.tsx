"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { type: "ok" | "error"; text: string } | null;

export default function AccountSettings({ currentEmail }: { currentEmail: string }) {
  const router = useRouter();

  const [email, setEmail] = useState(currentEmail);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passMsg, setPassMsg] = useState<Msg>(null);
  const [passBusy, setPassBusy] = useState(false);

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await fetch("/api/auth/change-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, currentPassword: emailPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setEmailBusy(false);
    if (!res.ok) {
      setEmailMsg({ type: "error", text: data.error ?? "No se pudo cambiar el correo." });
      return;
    }
    setEmailPassword("");
    setEmailMsg({ type: "ok", text: `Listo — ahora iniciás sesión con ${data.email}.` });
    router.refresh();
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassBusy(true);
    setPassMsg(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword, confirmPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setPassBusy(false);
    if (!res.ok) {
      setPassMsg({ type: "error", text: data.error ?? "No se pudo cambiar la contraseña." });
      return;
    }
    setNewPassword("");
    setConfirmPassword("");
    setPassMsg({ type: "ok", text: "Contraseña actualizada." });
    router.refresh();
  }

  const inputClass =
    "w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent";
  const labelClass = "block text-xs font-mono uppercase tracking-wide text-muted mb-1";

  function message(msg: Msg) {
    if (!msg) return null;
    return (
      <p className={`text-xs mt-1 ${msg.type === "ok" ? "text-good" : "text-critical"}`}>{msg.text}</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={saveEmail} className="bg-surface border border-border rounded p-5 flex flex-col gap-3">
        <h2 className="font-semibold text-sm">Cambiar mi correo</h2>
        <label className="block">
          <span className={labelClass}>Correo</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Tu contraseña actual</span>
          <input
            type="password"
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={inputClass}
          />
          <span className="block text-xs text-muted mt-1">
            Se pide para confirmar que sos vos — el correo es con lo que se entra a la app.
          </span>
        </label>
        <div>
          <button
            type="submit"
            disabled={emailBusy}
            className="text-sm font-medium bg-accent text-white rounded px-4 py-2 disabled:opacity-60"
          >
            {emailBusy ? "Guardando…" : "Guardar correo"}
          </button>
          {message(emailMsg)}
        </div>
      </form>

      <form onSubmit={savePassword} className="bg-surface border border-border rounded p-5 flex flex-col gap-3">
        <h2 className="font-semibold text-sm">Cambiar mi contraseña</h2>
        <label className="block">
          <span className={labelClass}>Contraseña nueva</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="mínimo 6 caracteres"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Repetir contraseña</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <div>
          <button
            type="submit"
            disabled={passBusy}
            className="text-sm font-medium bg-accent text-white rounded px-4 py-2 disabled:opacity-60"
          >
            {passBusy ? "Guardando…" : "Guardar contraseña"}
          </button>
          {message(passMsg)}
        </div>
      </form>
    </div>
  );
}
