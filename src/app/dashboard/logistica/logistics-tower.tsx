"use client";

import { useMemo, useState } from "react";
import type { LogisticsOverview } from "@/lib/logistics";

function effClass(pct: number) {
  if (pct >= 85) return "text-good";
  if (pct >= 70) return "text-accent-strong";
  return "text-critical";
}

function EffBar({ pct }: { pct: number }) {
  const color = pct >= 85 ? "bg-good" : pct >= 70 ? "bg-accent" : "bg-critical";
  return (
    <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export default function LogisticsTower({ data }: { data: LogisticsOverview }) {
  const [province, setProvince] = useState("all");
  const [carrier, setCarrier] = useState("all");

  const filteredProvinces = useMemo(
    () => (province === "all" ? data.byProvince : data.byProvince.filter((p) => p.province === province)),
    [data.byProvince, province]
  );
  const filteredCarriers = useMemo(
    () => (carrier === "all" ? data.byCarrier : data.byCarrier.filter((c) => c.carrier === carrier)),
    [data.byCarrier, carrier]
  );

  // Sin conexión no se dibuja nada: antes acá salían provincias y tasas de
  // devolución de ejemplo, iguales a las reales y sin ninguna marca que las
  // distinguiera.
  if (!data.connected) {
    return (
      <div className="rounded border border-border bg-surface p-8 text-center">
        <p className="text-sm font-medium">La torre logística todavía no tiene datos</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">
          {data.motivo ?? "Falta conectar el operador logístico."}
        </p>
        <a
          href="/dashboard/conexiones"
          className="mt-4 inline-block rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
        >
          Ir a Conexiones
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-muted">Envíos totales</p>
          <p className="text-2xl font-semibold tabular-nums">{data.totalShipments}</p>
        </div>
        <div className="bg-surface border border-border rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-muted">Entregados</p>
          <p className="text-2xl font-semibold tabular-nums text-good">{data.delivered}</p>
        </div>
        <div className="bg-surface border border-border rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-muted">Devueltos</p>
          <p className="text-2xl font-semibold tabular-nums text-critical">{data.returned}</p>
        </div>
        <div className="bg-surface border border-border rounded p-4">
          <p className="text-xs font-mono uppercase tracking-wide text-muted">Efectividad general</p>
          <p className={`text-2xl font-semibold tabular-nums ${effClass(data.effectivenessPct)}`}>
            {data.effectivenessPct}%
          </p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          className="text-xs border border-border rounded px-3 py-1.5 bg-transparent"
        >
          <option value="all">Todas las provincias</option>
          {data.byProvince.map((p) => (
            <option key={p.province} value={p.province}>
              {p.province}
            </option>
          ))}
        </select>
        <select
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          className="text-xs border border-border rounded px-3 py-1.5 bg-transparent"
        >
          <option value="all">Todas las transportadoras</option>
          {data.byCarrier.map((c) => (
            <option key={c.carrier} value={c.carrier}>
              {c.carrier}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted self-center">Ordenado por mayor efectividad</span>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Por provincia</h2>
          </div>
          <div className="flex flex-col">
            {filteredProvinces.map((p) => (
              <div key={p.province} className="px-4 py-3 border-b border-border last:border-b-0 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{p.province}</span>
                  <span className={`tabular-nums font-semibold ${effClass(p.effectivenessPct)}`}>{p.effectivenessPct}%</span>
                </div>
                <EffBar pct={p.effectivenessPct} />
                <p className="text-[11px] text-muted">
                  {p.total} envíos &middot; {p.delivered} entregados &middot; {p.returned} devueltos
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Por transportadora</h2>
          </div>
          <div className="flex flex-col">
            {filteredCarriers.map((c) => (
              <div key={c.carrier} className="px-4 py-3 border-b border-border last:border-b-0 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{c.carrier}</span>
                  <span className={`tabular-nums font-semibold ${effClass(c.effectivenessPct)}`}>{c.effectivenessPct}%</span>
                </div>
                <EffBar pct={c.effectivenessPct} />
                <p className="text-[11px] text-muted">
                  {c.total} envíos &middot; {c.delivered} entregados &middot; {c.returned} devueltos
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
