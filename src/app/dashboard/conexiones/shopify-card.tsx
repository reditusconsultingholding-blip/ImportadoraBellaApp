"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ShopifyCard({
  store,
  appCredentials,
}: {
  store: { id: string; shopDomain: string; connected: boolean } | null;
  // true si la app "Jarvin Panal" está configurada por variables de entorno:
  // en ese caso el token es opcional, Jarvis lo pide y lo renueva solo.
  appCredentials: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!store?.connected);
  const [shopDomain, setShopDomain] = useState(store?.shopDomain ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "warn" | "error"; text: string } | null>(
    null
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const res = await fetch("/api/shopify/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopDomain, accessToken: token }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setMessage({
        type: "error",
        text: [data.error ?? "No se pudo conectar.", data.detail].filter(Boolean).join(" "),
      });
      return;
    }
    setMessage({
      type: "ok",
      text: `Conectado a ${data.shopName ?? shopDomain}${data.ordersSynced ? ` — ${data.ordersSynced} órdenes sincronizadas.` : "."}`,
    });
    router.refresh();
  }

  async function syncNow() {
    if (!store) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch("/api/shopify/sync", { method: "POST" });
    const data = await res.json();
    setBusy(false);
    setMessage(
      res.ok
        ? { type: "ok", text: `Sincronizado — ${data.ordersSynced} órdenes.` }
        : { type: "error", text: data.error ?? "Falló la sincronización." }
    );
    router.refresh();
  }

  const connected = Boolean(store?.connected);

  return (
    <div className="bg-surface border border-border rounded p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">{store?.shopDomain || "Tienda de Shopify"}</p>
          <p className="text-xs text-muted">Ventas de toda la tienda, se anuncie o no cada producto</p>
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
              Dominio de la tienda
            </span>
            <input
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              required
              placeholder="importadora-bella.myshopify.com"
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Admin API access token {appCredentials && <span className="normal-case">(opcional)</span>}
            </span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              required={!appCredentials}
              placeholder={appCredentials ? "Dejalo vacío para usar la app Jarvin Panal" : "shpat_..."}
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
            {appCredentials && (
              <span className="block text-xs text-muted mt-1">
                La app de Shopify ya está configurada en el servidor — si dejás esto vacío, el
                token se pide y se renueva solo cada 24 horas.
              </span>
            )}
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="text-xs font-medium bg-accent text-white rounded px-3 py-1.5 disabled:opacity-60"
            >
              {busy ? "Conectando…" : "Guardar y sincronizar"}
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
