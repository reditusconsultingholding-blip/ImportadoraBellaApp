"use client";

import { useState } from "react";
import {
  AD_TYPES,
  ANGLES,
  AWARENESS_LEVELS,
  MARKET_ORIGINS,
  PHASES,
  VISUAL_FORMATS,
} from "@/lib/pipeline-options";
import type { ProductOption, RequirementRow, UserOption } from "./types";

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
      >
        <option value="" disabled>
          Elegir…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RequirementForm({
  products,
  users,
  onCreated,
  onCancel,
}: {
  products: ProductOption[];
  users: UserOption[];
  onCreated: (requirement: RequirementRow) => void;
  onCancel: () => void;
}) {
  const [adName, setAdName] = useState("");
  const [productId, setProductId] = useState("");
  const [externalId1, setExternalId1] = useState("");
  const [externalId2, setExternalId2] = useState("");
  const [adType, setAdType] = useState("");
  const [phase, setPhase] = useState("");
  const [visualFormat, setVisualFormat] = useState("");
  const [angle, setAngle] = useState("");
  const [awarenessLevel, setAwarenessLevel] = useState("");
  const [marketOrigin, setMarketOrigin] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/requirements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        adName,
        productId: productId || undefined,
        externalId1: externalId1 || undefined,
        externalId2: externalId2 || undefined,
        adType,
        phase,
        visualFormat,
        angle,
        awarenessLevel,
        marketOrigin,
        ownerId: ownerId || undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el requerimiento.");
      return;
    }
    onCreated({ ...data.requirement, date: data.requirement.date });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <label className="block">
        <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
          Nombre del anuncio
        </span>
        <input
          value={adName}
          onChange={(e) => setAdName(e.target.value)}
          required
          className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">Producto</span>
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
        >
          <option value="">Sin producto</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">ID #1</span>
          <input
            value={externalId1}
            onChange={(e) => setExternalId1(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">ID #2</span>
          <input
            value={externalId2}
            onChange={(e) => setExternalId2(e.target.value)}
            className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Tipo de anuncio" value={adType} onChange={setAdType} options={AD_TYPES} />
        <Select label="Fase" value={phase} onChange={setPhase} options={PHASES} />
      </div>

      <Select label="Formato visual" value={visualFormat} onChange={setVisualFormat} options={VISUAL_FORMATS} />
      <Select label="Ángulo" value={angle} onChange={setAngle} options={ANGLES} />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Awareness level"
          value={awarenessLevel}
          onChange={setAwarenessLevel}
          options={AWARENESS_LEVELS}
        />
        <Select label="Mercado origen" value={marketOrigin} onChange={setMarketOrigin} options={MARKET_ORIGINS} />
      </div>

      <label className="block">
        <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
          Editor asignado
        </span>
        <select
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
        >
          <option value="">Sin asignar</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="text-sm font-medium bg-accent text-white rounded px-4 py-2 disabled:opacity-60"
        >
          {busy ? "Creando…" : "Crear requerimiento"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-foreground transition"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
