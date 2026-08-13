import type { RequirementRow } from "./types";

const DONE_STATUSES = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

function isOverdue(requirement: RequirementRow) {
  if (!requirement.dueDate || DONE_STATUSES.has(requirement.status)) return false;
  return new Date(requirement.dueDate).getTime() < Date.now();
}

function dueLabel(dueDate: string) {
  return new Date(dueDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export default function RequirementCard({
  requirement,
  onClick,
  draggable = false,
  onDragStart,
}: {
  requirement: RequirementRow;
  onClick: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, id: string) => void;
}) {
  const overdue = isOverdue(requirement);

  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.(e, requirement.id)}
      className={`w-full text-left bg-surface border rounded p-3 hover:border-accent transition flex flex-col gap-2 ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${overdue ? "border-critical/60" : "border-border"}`}
    >
      {requirement.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={requirement.thumbnailUrl}
          alt=""
          className="w-full h-24 object-cover rounded bg-surface-2"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
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
        {requirement.dueDate && (
          <span
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
              overdue ? "bg-critical-bg text-critical" : "bg-surface-2 text-muted"
            }`}
          >
            {overdue ? "Vencido " : "Entrega "}
            {dueLabel(requirement.dueDate)}
          </span>
        )}
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
