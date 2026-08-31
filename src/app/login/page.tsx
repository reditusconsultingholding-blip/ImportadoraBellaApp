"use client";

import { useState } from "react";
import PasswordInput from "@/components/password-input";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

const inputClass =
  "w-full border border-border rounded px-3 py-2 bg-surface-2 outline-none focus:border-accent focus:bg-surface";
const labelClass = "block text-xs font-medium text-muted mb-1";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setAuthCode("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
    const body =
      mode === "login" ? { email, password } : { name, email, password, authCode };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(
        data.error ?? (mode === "login" ? "No se pudo iniciar sesión." : "No se pudo crear la cuenta.")
      );
      return;
    }

    router.push(data.mustChangePassword ? "/cambiar-clave" : "/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-navy px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded p-8"
      >
        <div className="mb-6">
          {/* El nombre entero en una línea. Partido en "Importadora" chiquito y
              "Bella" grande se leía como si la empresa se llamara Bella. */}
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
            Importadora Bella
          </h1>
          <p className="mt-1 text-[11px] leading-none text-muted">by Reditus Developers</p>
          <p className="mt-2 text-sm text-muted">
            Panel de campañas, ventas y pipeline creativo.
          </p>
        </div>

        {/* Selector de modo */}
        <div className="mb-6 inline-flex w-full items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
            type="button"
              onClick={() => switchTo(m)}
            className={`flex-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                mode === m
                  ? "bg-surface text-foreground shadow-[0_1px_2px_0_rgb(26_26_26_/_0.08)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {m === "login" ? "Ingresar" : "Crear cuenta"}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        {mode === "register" && (
          <label className="block mb-4">
            <span className={labelClass}>Nombre completo</span>
            <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="María José Pérez"
            />
          </label>
        )}

        <label className="block mb-4">
          <span className={labelClass}>Correo</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="nombre@bellacorp.store"
          />
        </label>

        <label className="block mb-4">
          <span className={labelClass}>Contraseña</span>
          <PasswordInput
            required
            minLength={mode === "register" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder={mode === "register" ? "mínimo 8 caracteres" : "••••••••"}
          />
        </label>

        {mode === "register" && (
          <label className="block mb-4">
            <span className={labelClass}>Código de autorización</span>
            <PasswordInput
            required
            inputMode="numeric"
            autoComplete="off"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            className={inputClass}
            placeholder="6 dígitos"
            />
            <span className="mt-1 block text-xs text-muted">
              Pedíselo a Fabricio o a Katherine. Cambia cada 30 segundos, así que usalo apenas te lo
              den.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-white rounded py-2.5 font-medium hover:bg-accent-strong transition disabled:opacity-60"
        >
          {loading
            ? mode === "login"
              ? "Ingresando…"
              : "Creando…"
            : mode === "login"
              ? "Ingresar"
              : "Crear cuenta"}
        </button>

        {mode === "register" && (
          <p className="mt-4 text-xs text-muted leading-relaxed">
            Tu cuenta queda creada al instante, pero sin acceso al panel hasta que un administrador
            te asigne tu rol. Le llega el aviso apenas te registrés.
          </p>
        )}
      </form>
    </main>
  );
}
