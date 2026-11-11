"use client";

import { useRouter } from "next/navigation";

// El selector de período de las pestañas nuevas (Shopify vs Ads y Riesgo).
// Es el mismo juego de botones que Resultados, sin el filtro de productos ni
// las horas de corte, que ahí no aplican.

const PERIODOS = [
  { id: "hoy", texto: "Hoy" },
  { id: "ayer", texto: "Ayer" },
  { id: "7d", texto: "7 días" },
  { id: "30d", texto: "30 días" },
  { id: "este-mes", texto: "Este mes" },
  { id: "mes-pasado", texto: "Mes pasado" },
];

export default function FiltroPeriodo({
  vista,
  periodo,
  desde,
  hasta,
  meses,
  conHoy = true,
}: {
  vista: string;
  periodo: string;
  desde: string;
  hasta: string;
  meses: { id: string; texto: string }[];
  conHoy?: boolean;
}) {
  const router = useRouter();
  const ir = (q: Record<string, string>) =>
    router.push(`/dashboard/control?${new URLSearchParams({ vista, ...q }).toString()}`);
  const mesActual = meses.find((m) => m.id === periodo);

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface p-3">
      {PERIODOS.filter((p) => conHoy || p.id !== "hoy").map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => ir({ periodo: p.id })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            periodo === p.id ? "bg-foreground text-background" : "text-muted hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          {p.texto}
        </button>
      ))}
      <select
        value={mesActual ? periodo : ""}
        onChange={(e) => e.target.value && ir({ periodo: e.target.value })}
        className={`rounded-full border bg-surface px-3 py-1.5 text-xs outline-none transition ${
          mesActual ? "border-foreground font-medium" : "border-border text-muted"
        }`}
        aria-label="Elegir un mes"
      >
        <option value="">Un mes…</option>
        {meses.map((m) => (
          <option key={m.id} value={m.id}>
            {m.texto.charAt(0).toUpperCase() + m.texto.slice(1)}
          </option>
        ))}
      </select>
      <div className="ml-auto flex items-center gap-1.5 text-xs text-muted">
        <input
          type="date"
          value={desde}
          onChange={(e) => e.target.value && ir({ desde: e.target.value, hasta })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
          aria-label="Desde"
        />
        <span>a</span>
        <input
          type="date"
          value={hasta}
          onChange={(e) => e.target.value && ir({ desde, hasta: e.target.value })}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
          aria-label="Hasta"
        />
      </div>
    </div>
  );
}
