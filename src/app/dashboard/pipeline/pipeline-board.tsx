"use client";

import { useState } from "react";
import KanbanBoard from "./kanban-board";
import RequirementsTable from "./requirements-table";
import RequirementForm from "./requirement-form";
import RequirementDrawer from "./requirement-drawer";
import type { ProductOption, RequirementRow, UserOption } from "./types";

export default function PipelineBoard({
  canManage,
  currentUserId,
  currentUserName,
  initialRequirements,
  products,
  users,
}: {
  canManage: boolean;
  currentUserId: string;
  currentUserName: string;
  initialRequirements: RequirementRow[];
  products: ProductOption[];
  users: UserOption[];
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [view, setView] = useState<"kanban" | "table">("kanban");
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  function upsert(requirement: RequirementRow) {
    setRequirements((prev) => {
      const exists = prev.some((r) => r.id === requirement.id);
      return exists ? prev.map((r) => (r.id === requirement.id ? requirement : r)) : [requirement, ...prev];
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pipeline creativo</h1>
          <p className="text-sm text-muted">
            {canManage
              ? "Todos los requerimientos de Importadora Bella."
              : `Lo que tenés asignado, ${currentUserName}.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded p-1">
            <button
              onClick={() => setView("kanban")}
              className={`text-xs font-medium px-3 py-1.5 rounded transition ${
                view === "kanban" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"
              }`}
            >
              Kanban
            </button>
            <button
              onClick={() => setView("table")}
              className={`text-xs font-medium px-3 py-1.5 rounded transition ${
                view === "table" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"
              }`}
            >
              Tabla
            </button>
          </div>
          {canManage && (
            <button
              onClick={() => setShowForm(true)}
              className="text-sm font-medium bg-accent text-white rounded px-4 py-2"
            >
              + Nuevo requerimiento
            </button>
          )}
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanBoard requirements={requirements} onOpen={setOpenId} />
      ) : (
        <RequirementsTable requirements={requirements} onOpen={setOpenId} />
      )}

      {showForm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-background border border-border rounded max-w-md w-full max-h-[90vh] overflow-y-auto p-5">
            <h2 className="text-sm font-semibold mb-4">Nuevo requerimiento</h2>
            <RequirementForm
              products={products}
              users={users}
              onCreated={(r) => {
                upsert(r);
                setShowForm(false);
              }}
              onCancel={() => setShowForm(false)}
            />
          </div>
        </div>
      )}

      {openId && (
        <RequirementDrawer
          requirementId={openId}
          canManage={canManage}
          currentUserId={currentUserId}
          users={users}
          onClose={() => setOpenId(null)}
          onUpdated={upsert}
        />
      )}
    </div>
  );
}
