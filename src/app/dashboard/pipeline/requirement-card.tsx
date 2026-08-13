import type { RequirementRow } from "./types";

export default function RequirementCard({
  requirement,
  onClick,
}: {
  requirement: RequirementRow;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface border border-border rounded p-3 hover:border-accent transition flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{requirement.adName}</p>
        {requirement.product && (
          <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted">
            {requirement.product.code}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent-strong">
          {requirement.adType}
        </span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-muted">
          {requirement.phase}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="truncate">{requirement.owner?.name ?? "Sin asignar"}</span>
        {requirement.hookRate !== null && (
          <span className="font-mono tabular-nums shrink-0">HR {requirement.hookRate}%</span>
        )}
      </div>
    </button>
  );
}
