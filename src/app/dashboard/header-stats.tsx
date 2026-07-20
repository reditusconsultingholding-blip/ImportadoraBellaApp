import type { HeaderStat } from "@/lib/sales";

function formatValue(stat: HeaderStat) {
  const prefix = stat.isMoney ? "US$" : "";
  if (stat.format === "percent") return `${stat.value}%`;
  if (stat.format === "count") return prefix + stat.value.toLocaleString("es-CO");
  const compact = (stat.value / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 });
  return `${prefix}${compact} k`;
}

function TrendIcon({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" className={up ? "text-good" : "text-critical"}>
      <path
        d={up ? "M1 12 L5 8 L8 10 L15 3" : "M1 4 L5 8 L8 6 L15 13"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HeaderStats({ stats }: { stats: HeaderStat[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3">
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
            {stat.label}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">{formatValue(stat)}</span>
            {stat.changePct === null ? (
              <span className="text-xs text-muted">—</span>
            ) : (
              <span
                className={`flex items-center gap-1 text-xs font-mono font-medium ${
                  stat.changePct >= 0 ? "text-good" : "text-critical"
                }`}
              >
                <TrendIcon up={stat.changePct >= 0} />
                {stat.changePct >= 0 ? "+" : ""}
                {stat.changePct}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
