"use client";

import {
  LineChart,
  Line,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import type { SalesOverview as SalesOverviewData } from "@/lib/sales";

// Los colores salen de globals.css (--chart-*), validados contra el fondo de
// la tarjeta para daltonismo y contraste. Se usan como variables y no como
// hex fijo para que el modo oscuro tenga sus propios pasos: los del modo claro
// sobre fondo oscuro dejan de distinguirse.
const ACCENT = "var(--chart-1)";
const REFERENCE = "var(--chart-muted)";
const CHANNEL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
];

const money = (n: number) =>
  n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function ChangeChip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-muted">—</span>;
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-mono font-medium ${
        up ? "text-good" : "text-critical"
      }`}
    >
      {up ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border rounded px-3 py-2 text-xs shadow-sm">
      <p className="text-muted font-mono mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2" style={{ color: p.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="tabular-nums text-foreground">{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function SalesOverview({
  data,
  periodo,
}: {
  data: SalesOverviewData;
  /** Que periodo cubren estos numeros. Sin esto nadie sabe si son de hoy. */
  periodo: string;
}) {
  // Sin tienda conectada no se dibuja nada: antes salian ventas de ejemplo con
  // el mismo aspecto que las reales.
  if (!data.connected) {
    return (
      <div className="rounded border border-border bg-surface p-8 text-center">
        <p className="text-sm font-medium">Todavia no hay una tienda conectada</p>
        <p className="mt-1.5 text-sm text-muted">
          Conecta Shopify para ver las ventas reales de {periodo.toLowerCase()}.
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
    <section className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
        Ventas · tienda completa · <span className="text-accent-strong">{periodo}</span>
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-surface border border-border rounded p-5">
          <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">
            Ventas totales a lo largo del tiempo
          </p>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-2xl font-semibold tabular-nums">{money(data.totalSales)}</span>
            <ChangeChip pct={data.totalSalesChangePct} />
          </div>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={data.salesSeries} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11, fill: "var(--muted)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  interval={1}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="today"
                  name={periodo}
                  stroke={ACCENT}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="yesterday"
                  name={"Período anterior"}
                  stroke={REFERENCE}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded" style={{ background: ACCENT }} /> {periodo}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 rounded border-t-2 border-dashed" style={{ borderColor: REFERENCE }} />{" "}
              Período anterior
            </span>
          </div>
        </div>

        <div className="bg-surface border border-border rounded p-5">
          <p className="font-mono text-xs uppercase tracking-wide text-muted mb-3">
            Desglose de ventas totales
          </p>
          <div className="flex flex-col">
            {data.breakdown.map((row, i) => (
              <div
                key={row.label}
                className={`flex items-center justify-between py-2 ${
                  i < data.breakdown.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <span className="text-sm text-accent-strong">{row.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm tabular-nums">{money(row.value)}</span>
                  <ChangeChip pct={row.changePct} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded p-5">
          <p className="font-mono text-xs uppercase tracking-wide text-muted mb-3">
            Ventas totales por canal de ventas
          </p>
          {/* La leyenda va DEBAJO del donut y no al costado: al costado le
              quedaban unos 90 px y "Releasit COD Form" se cortaba en "Re…".
              Abajo tiene el ancho entero de la tarjeta. */}
          <div className="flex flex-col items-center gap-3">
            <div style={{ width: 150, height: 150 }} className="relative shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={data.channels}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={48}
                    outerRadius={71}
                    strokeWidth={2}
                    stroke="var(--surface)"
                  >
                    {data.channels.map((c, i) => (
                      <Cell key={c.label} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[10px] uppercase tracking-wide text-muted">Total</span>
                <span className="text-sm font-semibold tabular-nums">
                  {money(data.channels.reduce((s, c) => s + c.value, 0))}
                </span>
              </div>
            </div>

            <div className="flex w-full flex-col gap-1.5">
              {data.channels.map((c, i) => (
                <div key={c.label} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}
                    />
                    <span className="truncate" title={c.label}>
                      {c.label}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs tabular-nums">{money(c.value)}</span>
                    <ChangeChip pct={c.changePct} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded p-5">
          <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">
            Valor medio del pedido a lo largo del tiempo
          </p>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-xl font-semibold tabular-nums">{money(data.aov)}</span>
            <ChangeChip pct={data.aovChangePct} />
          </div>
          <div style={{ width: "100%", height: 130 }}>
            <ResponsiveContainer>
              <LineChart data={data.aovSeries} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 10, fill: "var(--muted)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  tickLine={false}
                  interval={3}
                />
                <Tooltip content={<ChartTooltip />} />
                <Line type="monotone" dataKey="today" name={periodo} stroke={ACCENT} strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="yesterday"
                  name={"Período anterior"}
                  stroke={REFERENCE}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-surface border border-border rounded p-5">
          <p className="font-mono text-xs uppercase tracking-wide text-muted mb-3">
            Ventas totales por producto
          </p>
          <div className="flex flex-col gap-3">
            {data.topProducts.map((p) => (
              <div key={p.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="truncate pr-2">
                    {p.name} <span className="text-muted">· {p.category}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${p.share * 100}%`, background: ACCENT }}
                    />
                  </div>
                  <span className="text-xs tabular-nums shrink-0">{money(p.value)}</span>
                  <ChangeChip pct={p.changePct} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lo que dicen estos numeros, en palabras. Va justo debajo de canales
          y ticket promedio porque es de ahi de donde sale. Son cuentas, no
          opinion del modelo: salen al instante y dan siempre lo mismo. El
          analisis con criterio esta en el Pulso, mas abajo. */}
      {data.lecturas.length > 0 && (
        <div className="rounded border border-border bg-surface p-5">
          <p className="mb-2.5 font-mono text-xs uppercase tracking-wide text-muted">
            Que dicen estas ventas
          </p>
          <ul className="flex flex-col gap-2">
            {data.lecturas.map((l, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
