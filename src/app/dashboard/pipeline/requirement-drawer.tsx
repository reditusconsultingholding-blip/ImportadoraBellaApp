"use client";

import { useEffect, useState } from "react";
import { REQUIREMENT_STATUSES, STATUS_LABEL } from "@/lib/pipeline-options";
import type { RequirementRow, UserOption } from "./types";

type Comment = { id: string; body: string; createdAt: string; author: { id: string; name: string } };
type Version = { id: string; label: string; link: string; note: string | null; isFinal: boolean; authorName: string; createdAt: string };
type Activity = { id: string; actorName: string; action: string; detail: string; createdAt: string };
type Detail = RequirementRow & { comments: Comment[]; versions: Version[]; activity: Activity[] };

const METRIC_FIELDS: { key: keyof RequirementRow; label: string; suffix?: string }[] = [
  { key: "hookRate", label: "Hook Rate", suffix: "%" },
  { key: "ctr", label: "CTR", suffix: "%" },
  { key: "holdRate", label: "Hold Rate", suffix: "%" },
  { key: "purchases", label: "Compras" },
  { key: "cpa", label: "CPA" },
  { key: "frequency", label: "Frecuencia" },
  { key: "cpm", label: "CPM" },
];

const LINK_FIELDS: { key: keyof RequirementRow; label: string }[] = [
  { key: "originalVideoLink", label: "Video original Fase 2" },
  { key: "tiktokPostLink", label: "Publicación TikTok" },
  { key: "fbPostLink", label: "Publicación FB" },
];

export default function RequirementDrawer({
  requirementId,
  canManage,
  currentUserId,
  users,
  onClose,
  onUpdated,
}: {
  requirementId: string;
  canManage: boolean;
  currentUserId: string;
  users: UserOption[];
  onClose: () => void;
  onUpdated: (requirement: RequirementRow) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [sendingComment, setSendingComment] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [versionLink, setVersionLink] = useState("");
  const [versionNote, setVersionNote] = useState("");
  const [sendingVersion, setSendingVersion] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // El estado se toca solo dentro del .then: ponerlo en "cargando" desde el
    // cuerpo del efecto dispara un render de más y no resiste el modo estricto
    // de React. Arranca en true, así que la primera carga se ve igual.
    fetch(`/api/requirements/${requirementId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.requirement) {
          setDetail(data.requirement);
          setEditValues({
            nextAction: data.requirement.nextAction ?? "",
            notes: data.requirement.notes ?? "",
            originalVideoLink: data.requirement.originalVideoLink ?? "",
            tiktokPostLink: data.requirement.tiktokPostLink ?? "",
            fbPostLink: data.requirement.fbPostLink ?? "",
            hookRate: data.requirement.hookRate?.toString() ?? "",
            ctr: data.requirement.ctr?.toString() ?? "",
            holdRate: data.requirement.holdRate?.toString() ?? "",
            purchases: data.requirement.purchases?.toString() ?? "",
            cpa: data.requirement.cpa?.toString() ?? "",
            frequency: data.requirement.frequency?.toString() ?? "",
            cpm: data.requirement.cpm?.toString() ?? "",
            dueDate: data.requirement.dueDate ? data.requirement.dueDate.slice(0, 10) : "",
            thumbnailUrl: data.requirement.thumbnailUrl ?? "",
          });
        } else {
          setError(data.error ?? "No se pudo cargar.");
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [requirementId]);

  async function patch(fields: Record<string, string | null>) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/requirements/${requirementId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar.");
      return;
    }
    setDetail((prev) => (prev ? { ...prev, ...data.requirement } : prev));
    onUpdated(data.requirement);
  }

  async function saveFields() {
    await patch({
      nextAction: editValues.nextAction || null,
      notes: editValues.notes || null,
      originalVideoLink: editValues.originalVideoLink || null,
      tiktokPostLink: editValues.tiktokPostLink || null,
      fbPostLink: editValues.fbPostLink || null,
      hookRate: editValues.hookRate,
      ctr: editValues.ctr,
      holdRate: editValues.holdRate,
      purchases: editValues.purchases,
      cpa: editValues.cpa,
      frequency: editValues.frequency,
      cpm: editValues.cpm,
      dueDate: editValues.dueDate || null,
      thumbnailUrl: editValues.thumbnailUrl || null,
    });
  }

  async function sendVersion(e: React.FormEvent) {
    e.preventDefault();
    if (!versionLink.trim()) return;
    setSendingVersion(true);
    const res = await fetch(`/api/requirements/${requirementId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ link: versionLink, note: versionNote }),
    });
    const data = await res.json();
    setSendingVersion(false);
    if (res.ok) {
      setDetail((prev) => (prev ? { ...prev, versions: [...prev.versions, data.version] } : prev));
      setVersionLink("");
      setVersionNote("");
    }
  }

  async function markVersionFinal(versionId: string, isFinal: boolean) {
    const res = await fetch(`/api/requirements/${requirementId}/versions/${versionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFinal }),
    });
    if (res.ok) {
      // Marcar final también deja una entrada en la bitácora — se refresca
      // el detalle completo en vez de parchear a mano para no desincronizar.
      const fresh = await fetch(`/api/requirements/${requirementId}`).then((r) => r.json());
      if (fresh.requirement) setDetail(fresh.requirement);
    }
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setSendingComment(true);
    const res = await fetch(`/api/requirements/${requirementId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    const data = await res.json();
    setSendingComment(false);
    if (res.ok) {
      setDetail((prev) => (prev ? { ...prev, comments: [...prev.comments, data.comment] } : prev));
      setComment("");
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full bg-background border-l border-border overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold truncate pr-4">{detail?.adName ?? "Cargando…"}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">
            ×
          </button>
        </div>

        {loading && <p className="p-5 text-sm text-muted">Cargando…</p>}
        {error && <p className="p-5 text-sm text-critical">{error}</p>}

        {detail && (
          <div className="flex flex-col gap-6 p-5">
            <div>
              <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">Estado</span>
              <select
                value={detail.status}
                onChange={(e) => patch({ status: e.target.value })}
                disabled={saving}
                className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
              >
                {REQUIREMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>

            {canManage && (
              <div>
                <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
                  Editor asignado
                </span>
                <select
                  value={detail.ownerId ?? ""}
                  onChange={(e) => patch({ ownerId: e.target.value || null })}
                  disabled={saving}
                  className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
                >
                  <option value="">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">Producto</p>
                <p>{detail.product ? `${detail.product.code} — ${detail.product.name}` : "—"}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">Tipo</p>
                <p>{detail.adType}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">Fase</p>
                <p>{detail.phase}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">Formato visual</p>
                <p>{detail.visualFormat}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">Ángulo</p>
                <p>{detail.angle}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">Awareness</p>
                <p>{detail.awarenessLevel}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">Mercado</p>
                <p>{detail.marketOrigin}</p>
              </div>
              <div>
                <p className="font-mono uppercase tracking-wide text-muted mb-1">IDs</p>
                <p>{[detail.externalId1, detail.externalId2].filter(Boolean).join(" / ") || "—"}</p>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">Producción</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[11px] text-muted mb-1">Fecha de entrega</span>
                  <input
                    type="date"
                    value={editValues.dueDate ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, dueDate: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-muted mb-1">Miniatura (URL de imagen)</span>
                  <input
                    value={editValues.thumbnailUrl ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, thumbnailUrl: e.target.value }))}
                    placeholder="https://…"
                    className="w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                  />
                </label>
              </div>
              {editValues.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editValues.thumbnailUrl}
                  alt=""
                  className="w-full h-32 object-cover rounded bg-surface-2 mt-3"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <button
                onClick={saveFields}
                disabled={saving}
                className="mt-3 text-xs font-medium bg-accent text-white rounded px-3 py-1.5 disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">
                Versiones &middot; historial de iteraciones
              </p>
              <div className="flex flex-col gap-2 mb-3">
                {detail.versions.length === 0 && (
                  <p className="text-xs text-muted">Todavía no se subió ninguna versión.</p>
                )}
                {detail.versions.map((v) => (
                  <div
                    key={v.id}
                    className={`rounded border px-3 py-2 text-xs ${
                      v.isFinal ? "border-good bg-good-bg" : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <a href={v.link} target="_blank" rel="noreferrer" className="font-mono font-semibold text-accent-deep hover:underline">
                        {v.label}
                      </a>
                      <div className="flex items-center gap-2">
                        {v.isFinal ? (
                          <span className="text-good font-medium">✓ Final</span>
                        ) : (
                          canManage && (
                            <button onClick={() => markVersionFinal(v.id, true)} className="text-muted hover:text-accent-deep">
                              Marcar final
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    {v.note && <p className="text-muted mt-1">{v.note}</p>}
                    <p className="text-[10px] text-muted mt-1 font-mono">{v.authorName}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={sendVersion} className="flex flex-col gap-2">
                <input
                  value={versionLink}
                  onChange={(e) => setVersionLink(e.target.value)}
                  placeholder="Link de la nueva versión…"
                  className="w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <input
                    value={versionNote}
                    onChange={(e) => setVersionNote(e.target.value)}
                    placeholder="Nota (opcional)"
                    className="flex-1 border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                  />
                  <button
                    type="submit"
                    disabled={sendingVersion}
                    className="text-xs font-medium bg-accent text-white rounded px-3 py-2 disabled:opacity-60"
                  >
                    Subir
                  </button>
                </div>
              </form>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">Enlaces</p>
              <div className="flex flex-col gap-2">
                {LINK_FIELDS.map((f) => (
                  <input
                    key={f.key}
                    value={editValues[f.key as string] ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.label}
                    className="w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">
                Métricas &amp; decisión
              </p>
              <div className="grid grid-cols-2 gap-3">
                {METRIC_FIELDS.map((f) => (
                  <label key={f.key} className="block">
                    <span className="block text-[11px] text-muted mb-1">
                      {f.label}
                      {f.suffix ? ` (${f.suffix})` : ""}
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={editValues[f.key as string] ?? ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                    />
                  </label>
                ))}
              </div>
              <label className="block mt-3">
                <span className="block text-[11px] text-muted mb-1">Próxima acción</span>
                <input
                  value={editValues.nextAction ?? ""}
                  onChange={(e) => setEditValues((v) => ({ ...v, nextAction: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                />
              </label>
              <label className="block mt-3">
                <span className="block text-[11px] text-muted mb-1">Notas / aprendizaje</span>
                <textarea
                  value={editValues.notes ?? ""}
                  onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                />
              </label>
              <button
                onClick={saveFields}
                disabled={saving}
                className="mt-3 text-xs font-medium bg-accent text-white rounded px-3 py-1.5 disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>

            <div className="border-t border-border pt-4">
              <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">Actividad</p>
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto">
                {detail.activity.length === 0 && (
                  <p className="text-xs text-muted">Sin cambios registrados todavía.</p>
                )}
                {detail.activity.map((a) => (
                  <div key={a.id} className="text-xs flex items-baseline gap-2">
                    <span className="text-muted font-mono text-[10px] shrink-0">
                      {new Date(a.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                    </span>
                    <span>
                      <span className="font-medium">{a.actorName}</span>{" "}
                      <span className="text-muted">{a.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4 flex flex-col gap-3">
              <p className="font-mono text-xs uppercase tracking-wide text-muted">
                Chat interno &middot; usa @nombre para mencionar
              </p>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {detail.comments.length === 0 && (
                  <p className="text-xs text-muted">Todavía no hay comentarios.</p>
                )}
                {detail.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded px-3 py-2 text-xs max-w-[85%] ${
                      c.author.id === currentUserId ? "self-end bg-accent text-white" : "self-start bg-surface-2"
                    }`}
                  >
                    <p className="font-mono opacity-70 mb-0.5">{c.author.name}</p>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={sendComment} className="flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escribe un comentario… @Valentina"
                  className="flex-1 border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent"
                />
                <button
                  type="submit"
                  disabled={sendingComment}
                  className="text-xs font-medium bg-accent text-white rounded px-3 py-2 disabled:opacity-60"
                >
                  Enviar
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
