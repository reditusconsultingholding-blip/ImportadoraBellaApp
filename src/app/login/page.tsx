"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    setLoading(false);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar sesión.");
      return;
    }

    router.push(data.mustChangePassword ? "/cambiar-clave" : "/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-navy px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded p-8"
      >
        <div className="mb-8">
          <p className="font-bold uppercase tracking-wide text-sm text-foreground leading-tight">
            Importadora
          </p>
          <h1 className="font-serif italic text-4xl leading-tight -mt-1 text-foreground">Bella</h1>
          <p className="font-mono text-xs uppercase tracking-wide text-accent mt-2 mb-2">
            Jarvis
          </p>
          <p className="text-sm text-muted mt-1">
            Panel de campañas, ventas y pipeline creativo.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <label className="block mb-4">
          <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
            Correo
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 bg-transparent outline-none focus:border-accent"
            placeholder="fabrizio@empresa.com"
          />
        </label>

        <label className="block mb-6">
          <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
            Contraseña
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 bg-transparent outline-none focus:border-accent"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-white rounded py-2 font-medium hover:bg-accent-strong transition disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
