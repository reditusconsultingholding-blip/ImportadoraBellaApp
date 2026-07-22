"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddAccountButton({ platform }: { platform: "META" | "TIKTOK" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addAccount() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo agregar la cuenta.");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={addAccount}
        disabled={busy}
        className="text-sm font-medium border border-dashed border-border rounded px-3 py-2 text-muted hover:text-foreground hover:border-accent transition disabled:opacity-60"
      >
        {busy ? "Agregando…" : `+ Agregar otra cuenta de ${platform === "META" ? "Meta" : "TikTok"}`}
      </button>
      {error && <p className="text-xs text-critical mt-2">{error}</p>}
    </div>
  );
}
