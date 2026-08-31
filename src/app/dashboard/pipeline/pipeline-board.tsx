"use client";

import { useMemo, useState } from "react";
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
  title = "Pipeline creativo",
  subtitle,
  vista,
  encabezado = true,
}: {
  canManage: boolean;
  currentUserId: string;
  currentUserName: string;
  initialRequirements: RequirementRow[];
  products: ProductOption[];
  users: UserOption[];
  title?: string;
  subtitle?: string;
  /**
   * Cuando viene, la vista la manda quien nos usa (en el Pipeline, la URL) y
   * el selector propio desaparece. Sin esto habría dos controles para lo mismo
   * y uno de los dos siempre mostraría el estado equivocado.
   */
  vista?: "kanban" | "table";
  /** La ficha de producto trae su propio título arriba; el Pipeline también. */
  encabezado?: boolean;
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [vistaLocal, setVistaLocal] = useState<"kanban" | "table">("kanban");
  const view = vista ?? vistaLocal;
  const [showForm, setShowForm] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");

  function upsert(requirement: RequirementRow) {
    setRequirements((prev) => {
      const exists = prev.some((r) => r.id === requirement.id);
      return exists ? prev.map((r) => (r.id === requirement.id ? requirement : r)) : [requirement, ...prev];
    });
  }

  async function changeStatus(id: string, status: string) {
    const current = requirements.find((r) => r.id === id);
    if (!current || current.status === status) return;
    // Optimista: refleja el cambio ya mismo, corrige si el servidor lo rechaza.
    setRequirements((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const res = await fetch(`/api/requirements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const { requirement } = await res.json();
      upsert(requirement);
    } else if (current) {
      setRequirements((prev) => prev.map((r) => (r.id === id ? current : r)));
    }
  }

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of requirements) if (r.owner) map.set(r.owner.id, r.owner.name);
    return Array.from(map.entries());
  }, [requirements]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requirements.filter((r) => {
      if (q && !r.adName.toLowerCase().includes(q) && !r.product?.code.toLowerCase().includes(q) && !r.product?.name.toLowerCase().includes(q)) {
        return false;
      }
      if (ownerFilter !== "all" && r.ownerId !== ownerFilter) return false;
      if (productFilter !== "all" && r.productId !== productFilter) return false;
      return true;
    });
  }, [requirements, search, ownerFilter, productFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {encabezado && (
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted">
              {subtitle ??
                (canManage
                  ? "Todos los requerimientos de Importadora Bella."
                  : `Lo que tienes asignado, ${currentUserName}.`)}
            </p>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {vista == null && (
            <div className="flex items-center border border-border rounded p-1">
              <button
                onClick={() => setVistaLocal("kanban")}
                className={`text-xs font-medium px-3 py-1.5 rounded transition ${
                  view === "kanban" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"
                }`}
              >
                Kanban
              </button>
              <button
                onClick={() => setVistaLocal("table")}
                className={`text-xs font-medium px-3 py-1.5 rounded transition ${
                  view === "table" ? "bg-accent text-white" : "text-muted hover:bg-surface-2"
                }`}
              >
                Tabla
              </button>
            </div>
          )}
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

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por anuncio o producto…"
          className="text-xs border border-border rounded px-3 py-1.5 bg-transparent min-w-[200px]"
        />
        {owners.length > 0 && (
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="text-xs border border-border rounded px-3 py-1.5 bg-transparent"
          >
            <option value="all">Todos los editores</option>
            {owners.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        {products.length > 0 && (
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="text-xs border border-border rounded px-3 py-1.5 bg-transparent"
          >
            <option value="all">Todos los productos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </select>
        )}
        {(search || ownerFilter !== "all" || productFilter !== "all") && (
          <span className="text-xs text-muted">{filtered.length} de {requirements.length}</span>
        )}
      </div>

      {view === "kanban" ? (
        <KanbanBoard requirements={filtered} onOpen={setOpenId} onStatusChange={changeStatus} canDrag />
      ) : (
        <RequirementsTable requirements={filtered} onOpen={setOpenId} />
      )}

      {showForm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          {/* Mismo marco verde que el panel de detalle: los dos son "esto es
              lo que estás editando", y con dos cromos distintos parecían dos
              partes de la app que no se hablan. */}
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded bg-brand-navy">
            <h2 className="border-b border-white/10 px-5 py-4 text-sm font-semibold text-white">
              Nuevo requerimiento
            </h2>
            <div className="m-4 rounded border border-white/10 bg-surface p-4">
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
