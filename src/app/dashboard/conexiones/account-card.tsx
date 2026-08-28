"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PLATFORM_LABEL: Record<string, string> = {
  META: "Meta (Facebook + Instagram)",
  TIKTOK: "TikTok",
};

const ID_LABEL: Record<string, string> = {
  META: "Ad Account ID (ej. act_1234567890)",
  TIKTOK: "Advertiser ID",
};

export default function AccountCard({
  id,
  platform,
  name,
  externalId,
  connected,
}: {
  id: string;
  platform: string;
  name: string;
  externalId: string;
  connected: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!connected);
  const [accountId, setAccountId] = useState(connected ? externalId : "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "warn" | "error"; text: string } | null>(
    null
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const res = await fetch(`/api/accounts/${id}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ externalId: accountId, accessToken: token }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setMessage({ type: "error", text: data.error ?? "No se pudo guardar." });
      return;
    }
    if (!data.synced) {
      setMessage({ type: "warn", text: data.warning ?? "Se guardó, pero no se pudo sincronizar todavía." });
    } else {
      setMessage({ type: "ok", text: "Conectado y sincronizado." });
    }
    router.refresh();
  }

  async function syncNow() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/accounts/${id}/sync`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMessage(
      res.ok
        ? { type: "ok", text: "Sincronizado." }
        : { type: "error", text: data.error ?? "Falló la sincronización." }
    );
    router.refresh();
  }

  async function remove() {
    if (!confirm("¿Eliminar esta cuenta pendiente?")) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage({ type: "error", text: data.error ?? "No se pudo eliminar." });
      return;
    }
    router.refresh();
  }

  return (
    <div className="bg-surface border border-border rounded p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted">{PLATFORM_LABEL[platform] ?? platform}</p>
        </div>
        <span
          className={`font-mono text-xs px-2 py-1 rounded ${
            connected ? "bg-good-bg text-good" : "bg-pending-bg text-muted"
          }`}
        >
          {connected ? "Conectada" : "Pendiente"}
        </span>
      </div>

      {connected && !open && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={syncNow}
            disabled={busy}
            className="text-xs font-medium border border-border rounded px-3 py-1.5 disabled:opacity-60"
          >
            {busy ? "Sincronizando…" : "Sincronizar ahora"}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-muted hover:text-foreground transition"
          >
            Cambiar token
          </button>
        </div>
      )}

      {open && (
        <form onSubmit={save} className="mt-4 flex flex-col gap-3">
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              {ID_LABEL[platform] ?? "ID de cuenta"}
            </span>
            <input
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Access token
            </span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              required
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
              placeholder="pegar el token de larga duración aquí"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="text-xs font-medium bg-accent text-white rounded px-3 py-1.5 disabled:opacity-60"
            >
              {busy ? "Guardando…" : "Guardar y sincronizar"}
            </button>
            {connected && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xs text-muted hover:text-foreground transition"
              >
                Cancelar
              </button>
            )}
            {!connected && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="text-xs text-critical hover:underline disabled:opacity-60"
              >
                Eliminar
              </button>
            )}
          </div>
        </form>
      )}

      {message && (
        <p
          className={`text-xs mt-3 ${
            message.type === "ok" ? "text-good" : message.type === "warn" ? "text-accent-strong" : "text-critical"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
