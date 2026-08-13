"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DropiCard({
  connection,
}: {
  connection: { hasKey: boolean; connectedAt: string | null } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!connection?.hasKey);
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
          <p className="text-xs text-muted">Torre logística — envíos, devoluciones y efectividad por transportadora</p>
        </div>
        <span
          className={`font-mono text-xs px-2 py-1 rounded ${
            hasKey ? "bg-good-bg text-good" : "bg-pending-bg text-muted"
          }`}
        >
          {hasKey ? "Key guardada" : "Pendiente"}
        </span>
      </div>

      <p className="text-xs text-muted mt-3">
        La API de Dropi es privada — hay que pedirle acceso (<code>dropi-integration-key</code>) al equipo de IT
        de Dropi. Mientras eso se confirma, la torre logística muestra datos de ejemplo con la misma estructura
        que va a tener con datos reales.
      </p>

      {hasKey && !open && (
        <button onClick={() => setOpen(true)} className="text-xs text-muted hover:text-foreground transition mt-3">
          Cambiar key
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
