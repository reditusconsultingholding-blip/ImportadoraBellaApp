"use client";

import { useState } from "react";
import { REQUIREMENT_STATUSES, STATUS_LABEL } from "@/lib/pipeline-options";
import RequirementCard from "./requirement-card";
import type { RequirementRow } from "./types";

export default function KanbanBoard({
  requirements,
  onOpen,
  onStatusChange,
  canDrag = false,
}: {
  requirements: RequirementRow[];
  onOpen: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
  canDrag?: boolean;
}) {
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData("text/requirement-id", id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setDragOverStatus(null);
    const id = e.dataTransfer.getData("text/requirement-id");
    if (id) onStatusChange?.(id, status);
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {REQUIREMENT_STATUSES.map((status) => {
        const items = requirements.filter((r) => r.status === status);
        const isDragTarget = canDrag && dragOverStatus === status;
        return (
          <div
            key={status}
            className="w-72 shrink-0 flex flex-col gap-3"
            onDragOver={(e) => {
              if (!canDrag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragOverStatus !== status) setDragOverStatus(status);
            }}
            onDragLeave={() => {
              if (dragOverStatus === status) setDragOverStatus(null);
            }}
            onDrop={(e) => canDrag && handleDrop(e, status)}
          >
            <div className="flex items-center justify-between px-1">
              <h3 className="font-mono text-xs uppercase tracking-wide text-muted">
                {STATUS_LABEL[status] ?? status}
              </h3>
              <span className="font-mono text-xs text-muted">{items.length}</span>
            </div>
            <div
              className={`flex flex-col gap-2 min-h-[60px] rounded transition ${
                isDragTarget ? "bg-accent/10 ring-1 ring-accent/40" : ""
              }`}
            >
              {items.map((r) => (
                <RequirementCard
                  key={r.id}
                  requirement={r}
                  onClick={() => onOpen(r.id)}
                  draggable={canDrag}
                  onDragStart={handleDragStart}
                />
              ))}
              {items.length === 0 && (
                <div className="border border-dashed border-border rounded p-3 text-xs text-muted text-center">
                  {isDragTarget ? "Soltar acá" : "Vacío"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
