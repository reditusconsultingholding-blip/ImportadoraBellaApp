"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DropiCard({
  connection,
}: {
  connection: { hasKey: boolean; connectedAt: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "warn" | "error"; text: string } | null>(null);

  const hasKey = Boolean(connection?.hasKey);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const res = await fetch("/api/dropi/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationKey: key }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo guardar." });
      return;
    }
    setMessage({ type: "warn", text: data.warning ?? "Guardado." });
    router.refresh();
  }

  return (
    <div className="bg-surface border border-border rounded p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Dropi (Ecuador)</p>
          <p className="text-xs text-muted">Torre logística — módulo a futuro, fuera del alcance actual</p>
        </div>
        <span
          className={`font-mono text-xs px-2 py-1 rounded ${
            hasKey ? "bg-good-bg text-good" : "bg-surface-2 text-muted"
          }`}
        >
          {hasKey ? "Key guardada" : "En espera"}
        </span>
      </div>

      <p className="text-xs text-muted mt-3">
        Esta integración no se está gestionando por el momento — queda documentada para retomarla más
        adelante, cuando se decida avanzarla. No hace falta pedir ni cargar ninguna key todavía.
      </p>

      {hasKey && !open && (
        <button onClick={() => setOpen(true)} className="text-xs text-muted hover:text-foreground transition mt-3">
          Cambiar key
        </button>
      )}
      {!hasKey && !open && (
        <button onClick={() => setOpen(true)} className="text-xs text-muted hover:text-foreground transition mt-3">
          Cargar key de todas formas
        </button>
      )}

      {open && (
        <form onSubmit={save} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Integration key
            </span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
              required
              placeholder="dropi-integration-key..."
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="text-xs font-medium bg-accent text-white rounded px-3 py-1.5 disabled:opacity-60"
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
            {hasKey && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted hover:text-foreground transition"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {message && (
        <p className={`text-xs mt-3 ${message.type === "ok" ? "text-good" : message.type === "warn" ? "text-accent-strong" : "text-critical"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
