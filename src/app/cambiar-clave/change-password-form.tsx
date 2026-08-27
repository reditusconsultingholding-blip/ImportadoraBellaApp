"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword, confirmPassword }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo cambiar la contraseña.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
          {error}
        </div>
      )}

      <label className="block">
        <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
          Contraseña nueva
        </span>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 bg-transparent outline-none focus:border-accent"
          placeholder="mínimo 8 caracteres"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
          Repetir contraseña
        </span>
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 bg-transparent outline-none focus:border-accent"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-accent text-white rounded py-2 font-medium hover:bg-accent-strong transition disabled:opacity-60"
      >
        {loading ? "Guardando…" : "Guardar y entrar"}
      </button>

      {!forced && (
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-muted hover:text-foreground transition"
        >
          Cancelar
        </button>
      )}
    </form>
  );
}
