"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NoteDrawer from "./note-drawer";

export type BoardItem =
  | {
      kind: "folder";
      id: string;
      x: number;
      y: number;
      color: string | null;
      name: string;
      counts: { folders: number; products: number; notes: number };
    }
  | {
      kind: "product";
      id: string;
      x: number;
      y: number;
      color: string | null;
      name: string;
      code: string;
      cpaTarget: number;
      salePrice: number | null;
      unitCost: number | null;
      stats: { done: number; pending: number; good: number; bad: number };
    }
  | {
      kind: "note";
      id: string;
      x: number;
      y: number;
      color: string | null;
      title: string | null;
      body: string;
      status: string;
      priority: string;
      dueDate: string | null;
      format: string | null;
      assigneeName: string | null;
      commentCount: number;
    };

const CARD_W = { folder: 200, product: 240, note: 200 } as const;
const GRID = 8; // las tarjetas se acomodan a una grilla de 8px al soltarlas

// Mismas etapas que la ficha, para que la tarjeta y el panel digan lo mismo.
const STATUS_LABEL: Record<string, string> = {
  IDEA: "Idea",
  GUION: "Guion",
  GRABACION: "Grabación",
  EDICION: "Edición",
  REVISION: "Revisión",
  APROBADO: "Aprobado",
  PUBLICADO: "Publicado",
};

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export default function ProductBoard({
  items: initialItems,
  folderId,
  path,
  canManage,
  people,
  openNoteId,
  parentId,
}: {
  items: BoardItem[];
  folderId: string | null;
  path: { id: string; name: string }[];
  canManage: boolean;
  people: { id: string; name: string; avatarUrl: string | null }[];
  openNoteId: string | null;
  parentId: string | null;
}) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<null | "folder" | "product" | "note">(null);
  const [openNote, setOpenNote] = useState<string | null>(openNoteId);

  // El servidor manda la verdad en cada refresh; el estado local solo existe
  // para que arrastrar se sienta instantáneo. Se sincroniza durante el render
  // y no desde un efecto: en un efecto se pinta un cuadro con las tarjetas en
  // la posición vieja antes de corregirse.
  const [ultimoOpen, setUltimoOpen] = useState(openNoteId);
  if (openNoteId !== ultimoOpen) {
    setUltimoOpen(openNoteId);
    setOpenNote(openNoteId);
  }

  const [ultimosItems, setUltimosItems] = useState(initialItems);
  if (initialItems !== ultimosItems) {
    setUltimosItems(initialItems);
    setItems(initialItems);
  }

  const drag = useRef<{ id: string; kind: string; dx: number; dy: number } | null>(null);

  const save = useCallback(
    async (payload: Record<string, unknown>, method: "POST" | "PATCH" | "DELETE" = "PATCH") => {
      setError(null);
      const res =
        method === "DELETE"
          ? await fetch(`/api/board?kind=${payload.kind}&id=${payload.id}`, { method })
          : await fetch("/api/board", {
              method,
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "No se pudo guardar.");
        router.refresh();
        return false;
      }
      return true;
    },
    [router]
  );

  // Igual que save, pero devuelve lo que respondió el servidor — hace falta
  // para conocer el id de la ficha recién creada y abrirla.
  const saveReturning = useCallback(
    async (payload: Record<string, unknown>) => {
      setError(null);
      const res = await fetch("/api/board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar.");
        return null;
      }
      return data as { id?: string };
    },
    []
  );

  function onPointerDown(e: React.PointerEvent, item: BoardItem) {
    if (!canManage) return;
    // Solo arrastra desde el cuerpo de la tarjeta, no desde botones o links.
    if ((e.target as HTMLElement).closest("a,button,textarea,input")) return;
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return;
    drag.current = {
      id: item.id,
      kind: item.kind,
      dx: e.clientX - board.left - item.x,
      dy: e.clientY - board.top - item.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const board = boardRef.current?.getBoundingClientRect();
    if (!d || !board) return;
    const x = Math.max(0, e.clientX - board.left - d.dx);
    const y = Math.max(0, e.clientY - board.top - d.dy);
    setItems((prev) => prev.map((it) => (it.id === d.id ? { ...it, x, y } : it)));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const moved = items.find((it) => it.id === d.id);
    if (!moved) return;
    const x = Math.round(moved.x / GRID) * GRID;
    const y = Math.round(moved.y / GRID) * GRID;
    setItems((prev) => prev.map((it) => (it.id === d.id ? { ...it, x, y } : it)));
    save({ kind: d.kind, id: d.id, positionX: x, positionY: y });
  }

  // Coloca lo nuevo en el primer hueco libre de una grilla imaginaria, para
  // que no aparezcan todas las tarjetas apiladas en la misma esquina.
  function nextSlot() {
    const cols = 4;
    const i = items.length;
    return { x: 24 + (i % cols) * 264, y: 24 + Math.floor(i / cols) * 200 };
  }

  async function create(form: FormData) {
    const kind = creating;
    if (!kind) return;
    const slot = nextSlot();
    const payload: Record<string, unknown> = {
      kind,
      folderId,
      positionX: slot.x,
      positionY: slot.y,
    };
    if (kind === "folder") payload.name = form.get("name");
    if (kind === "note") {
      payload.title = form.get("title");
      payload.body = form.get("body") || "Sin brief todavía.";
    }
    if (kind === "product") {
      payload.name = form.get("name");
      payload.code = form.get("code");
      const cpa = Number(form.get("cpaTarget"));
      if (Number.isFinite(cpa) && cpa > 0) payload.cpaTarget = cpa;
      const price = Number(form.get("salePrice"));
      if (Number.isFinite(price) && price > 0) payload.salePrice = price;
      const cost = Number(form.get("unitCost"));
      if (Number.isFinite(cost) && cost > 0) payload.unitCost = cost;
    }
    const created = await saveReturning(payload);
    if (created) {
      setCreating(null);
      router.refresh();
      // Una ficha recién creada se abre sola: lo primero que uno quiere es
      // llenarle la fecha y el formato.
      if (kind === "note" && created.id) setOpenNote(created.id);
    }
  }

  async function remove(item: BoardItem) {
    const what =
      item.kind === "folder"
        ? "¿Borrar la carpeta? Las subcarpetas se borran; los productos vuelven a la raíz."
        : item.kind === "product"
          ? "¿Borrar este producto?"
          : "¿Borrar la nota?";
    if (!confirm(what)) return;
    if (await save({ kind: item.kind, id: item.id }, "DELETE")) router.refresh();
  }

  const boardHeight = Math.max(
    520,
    ...items.map((it) => it.y + (it.kind === "product" ? 190 : 130) + 40)
  );

  const btn =
    "text-[13px] font-medium border border-border rounded px-3 py-1.5 bg-surface hover:bg-surface-2 transition";

  return (
    <div className="flex flex-col gap-3">
      {/* Migas de pan + acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1 text-sm min-w-0">
          <Link
            href="/dashboard/productos"
            className={folderId ? "text-muted hover:text-foreground transition" : "font-medium"}
          >
            Catálogo
          </Link>
          {path.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1 min-w-0">
              <span className="text-muted">/</span>
              {i === path.length - 1 ? (
                <span className="font-medium truncate">{p.name}</span>
              ) : (
                <Link
                  href={`/dashboard/productos?carpeta=${p.id}`}
                  className="text-muted hover:text-foreground transition truncate"
                >
                  {p.name}
                </Link>
              )}
            </span>
          ))}
        </nav>

        {canManage && (
          <div className="flex items-center gap-2">
            {folderId && (
              <Link
                href={parentId ? `/dashboard/productos?carpeta=${parentId}` : "/dashboard/productos"}
                className={btn}
              >
                ← Volver atrás
              </Link>
            )}
            <button onClick={() => setCreating("folder")} className={btn}>
              + Carpeta
            </button>
            <button onClick={() => setCreating("note")} className={btn}>
              + Ficha
            </button>
            <button
              onClick={() => setCreating("product")}
              className="text-[13px] font-medium bg-accent text-white rounded px-3 py-1.5 hover:bg-accent-strong transition"
            >
              + Producto
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      {creating && (
        <form
          action={create}
          className="bg-surface border border-border rounded p-4 flex flex-wrap items-end gap-3"
        >
          {creating === "note" ? (
            <>
              <label className="flex-1 min-w-[200px]">
                <span className="block text-xs font-medium text-muted mb-1">Título de la ficha</span>
                <input
                  name="title"
                  required
                  autoFocus
                  placeholder="Reel dolor de espalda · testimonio"
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
                />
              </label>
              <label className="flex-1 min-w-[240px]">
                <span className="block text-xs font-medium text-muted mb-1">Brief (opcional)</span>
                <input
                  name="body"
                  placeholder="Qué hay que hacer — se completa después"
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
                />
              </label>
            </>
          ) : (
            <>
              <label className="flex-1 min-w-[180px]">
                <span className="block text-xs font-medium text-muted mb-1">
                  {creating === "folder" ? "Nombre de la carpeta" : "Nombre del producto"}
                </span>
                <input
                  name="name"
                  required
                  autoFocus
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
                />
              </label>
              {creating === "product" && (
                <>
                  <label className="w-32">
                    <span className="block text-xs font-medium text-muted mb-1">Código</span>
                    <input
                      name="code"
                      required
                      placeholder="BAT-001"
                      className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent uppercase"
                    />
                  </label>
                  <label className="w-28">
                    <span className="block text-xs font-medium text-muted mb-1">CPA objetivo</span>
                    <input
                      name="cpaTarget"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="10"
                      className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
                    />
                  </label>
                  <label className="w-28">
                    <span className="block text-xs font-medium text-muted mb-1">Precio</span>
                    <input
                      name="salePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
                    />
                  </label>
                  <label className="w-28">
                    <span className="block text-xs font-medium text-muted mb-1">Costo</span>
                    <input
                      name="unitCost"
                      type="number"
                      step="0.01"
                      min="0"
                      className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
                    />
                  </label>
                </>
              )}
            </>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="text-[13px] font-medium bg-accent text-white rounded px-3 py-2 hover:bg-accent-strong transition"
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => setCreating(null)}
              className="text-[13px] text-muted hover:text-foreground transition px-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* El tablero */}
      <div
        ref={boardRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          height: boardHeight,
          backgroundImage:
            "radial-gradient(circle, color-mix(in srgb, var(--border-strong) 55%, transparent) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
        className="relative w-full rounded border border-border bg-surface overflow-hidden"
      >
        {items.length === 0 && (
          <div className="absolute inset-0 grid place-items-center">
            <p className="text-sm text-muted text-center max-w-xs">
              {canManage
                ? "Todavía no hay nada acá. Empezá creando una carpeta o cargando tu primer producto."
                : "Todavía no hay productos cargados en esta carpeta."}
            </p>
          </div>
        )}

        {items.map((item) => (
          <div
            key={`${item.kind}-${item.id}`}
            onPointerDown={(e) => onPointerDown(e, item)}
            style={{ left: item.x, top: item.y, width: CARD_W[item.kind] }}
            className={`group absolute select-none rounded border bg-surface ${
              canManage ? "cursor-grab active:cursor-grabbing" : ""
            } ${
              item.kind === "note"
                ? "border-warning/35 bg-pending-bg"
                : "border-border hover:border-border-strong"
            } shadow-[0_1px_2px_0_rgb(26_26_26_/_0.06)] transition-shadow hover:shadow-[0_8px_24px_-6px_rgb(26_26_26_/_0.14)]`}
          >
            {canManage && (
              <button
                onClick={() => remove(item)}
                title="Borrar"
                className="absolute -right-2 -top-2 z-10 hidden h-6 w-6 place-items-center rounded-full border border-border bg-surface text-muted hover:text-critical group-hover:grid"
              >
                <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            )}

            {item.kind === "folder" && (
              <Link href={`/dashboard/productos?carpeta=${item.id}`} className="block p-3.5">
                <span className="flex items-center gap-2">
                  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" className="text-accent shrink-0">
                    <path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3l1.6 2h6.4a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 15 16H4a1.5 1.5 0 0 1-1.5-1.5z" />
                  </svg>
                  <span className="font-medium text-sm truncate">{item.name}</span>
                </span>
                <span className="mt-2 block text-xs text-muted">
                  {item.counts.products} producto{item.counts.products === 1 ? "" : "s"}
                  {item.counts.folders > 0 && ` · ${item.counts.folders} carpeta${item.counts.folders === 1 ? "" : "s"}`}
                  {item.counts.notes > 0 && ` · ${item.counts.notes} nota${item.counts.notes === 1 ? "" : "s"}`}
                </span>
              </Link>
            )}

            {item.kind === "product" && (
              <div className="p-3.5">
                <Link href={`/dashboard/productos/${item.code}`} className="block">
                  <span className="block font-medium text-sm leading-snug">{item.name}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-muted">{item.code}</span>
                </Link>
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                    CPA obj. {money(item.cpaTarget)}
                  </span>
                  {item.salePrice != null && (
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-muted">
                      PVP {money(item.salePrice)}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[11px]">
                  <span className="rounded bg-surface-2 px-1.5 py-1">
                    <span className="block text-muted">Realizado</span>
                    <span className="font-semibold tabular-nums">{item.stats.done}</span>
                  </span>
                  <span className="rounded bg-surface-2 px-1.5 py-1">
                    <span className="block text-muted">Por hacer</span>
                    <span className="font-semibold tabular-nums">{item.stats.pending}</span>
                  </span>
                  {(item.stats.good > 0 || item.stats.bad > 0) && (
                    <>
                      <span className="rounded bg-good-bg px-1.5 py-1">
                        <span className="block text-good">Buen CPA</span>
                        <span className="font-semibold tabular-nums text-good">{item.stats.good}</span>
                      </span>
                      <span className="rounded bg-critical-bg px-1.5 py-1">
                        <span className="block text-critical">Mal CPA</span>
                        <span className="font-semibold tabular-nums text-critical">{item.stats.bad}</span>
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {item.kind === "note" && (
              <button
                onClick={() => setOpenNote(item.id)}
                className="block w-full p-3.5 text-left"
                title="Abrir la ficha"
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.priority === "ALTA"
                        ? "bg-critical"
                        : item.priority === "BAJA"
                          ? "bg-muted"
                          : "bg-warning"
                    }`}
                  />
                  <span className="truncate text-[13px] font-medium">
                    {item.title || "Sin título"}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] text-muted line-clamp-2">{item.body}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                  <span className="rounded bg-surface/70 px-1.5 py-0.5 font-medium text-accent-strong">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                  {item.dueDate && (
                    <span className="rounded bg-surface/70 px-1.5 py-0.5 text-muted">
                      {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString("es-EC", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  )}
                  {item.format && (
                    <span className="rounded bg-surface/70 px-1.5 py-0.5 text-muted">
                      {item.format}
                    </span>
                  )}
                  {item.commentCount > 0 && (
                    <span className="rounded bg-surface/70 px-1.5 py-0.5 text-muted">
                      {item.commentCount} 💬
                    </span>
                  )}
                </span>
                {item.assigneeName && (
                  <span className="mt-1.5 block truncate text-[10px] text-muted">
                    {item.assigneeName}
                  </span>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {openNote && (
        <NoteDrawer
          noteId={openNote}
          people={people}
          canManage={canManage}
          onClose={() => {
            setOpenNote(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
