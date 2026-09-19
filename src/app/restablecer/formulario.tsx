"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PasswordInput from "@/components/password-input";

const inputClass =
  "w-full border border-border rounded px-3 py-2 bg-surface-2 outline-none focus:border-accent focus:bg-surface";
const labelClass = "block text-xs font-medium text-muted mb-1";

export default function FormularioRestablecer() {
  const token = useSearchParams().get("token") ?? "";
  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (clave !== confirmacion) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }
    setEnviando(true);
    setError(null);
    const res = await fetch("/api/auth/restablecer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, clave, confirmacion }),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo cambiar la contraseña.");
      return;
    }
    setListo(true);
  }

  return (
    <form onSubmit={enviar} className="w-full max-w-sm bg-surface border border-border rounded p-8">
      <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">Contraseña nueva</h1>
      <p className="mt-1 text-sm text-muted">Importadora Bella · Jarvis</p>

      {!token && (
        <p className="mt-5 text-sm text-critical">
          Este enlace está incompleto. Pide uno nuevo desde la pantalla de entrada.
        </p>
      )}

      {listo ? (
        <>
          <p className="mt-5 text-sm text-foreground">
            Listo. Tu contraseña cambió y se cerraron las sesiones que tenías abiertas en otros equipos.
          </p>
          <Link
            href="/login"
            className="mt-5 block w-full rounded bg-accent py-2.5 text-center font-medium text-white hover:bg-accent-strong"
          >
            Entrar
          </Link>
        </>
      ) : (
        token && (
          <>
            {error && (
              <div className="mt-5 text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
                {error}
              </div>
            )}
            <label className="mt-5 block">
              <span className={labelClass}>Contraseña nueva</span>
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className={inputClass}
                placeholder="mínimo 8 caracteres"
              />
            </label>
            <label className="mt-4 block">
              <span className={labelClass}>Repítela</span>
              <PasswordInput
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                className={inputClass}
              />
            </label>
            <button
              type="submit"
              disabled={enviando}
              className="mt-5 w-full rounded bg-accent py-2.5 font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
            >
              {enviando ? "Guardando…" : "Guardar contraseña"}
            </button>
          </>
        )
      )}
    </form>
  );
}
