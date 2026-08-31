"use client";

import { useEffect, useState } from "react";
import {
  ESTADOS_CREATIVO,
  PROXIMAS_ACCIONES,
  REQUIREMENT_STATUSES,
  STATUS_LABEL,
  leerHookRate,
} from "@/lib/pipeline-options";
import type { RequirementRow, UserOption } from "./types";

// El panel de una pieza.
//
// El marco va en el verde de marca —el mismo `--brand-navy` de la barra
// lateral— y no en el gris de la app: abierto sobre el tablero, un panel gris
// sobre fondo gris se lee como parte de la tabla y no como "esto es lo que
// estás editando". Lo que NO se pinta de verde es lo editable: un input con
// texto blanco sobre verde pierde el estado de foco y se vuelve ilegible, así
// que cada bloque con campos va en una tarjeta de superficie normal adentro del
// marco. La ficha de solo lectura sí va sobre el verde, que es justo la parte
// que se mira sin tocar.

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

// Las dos que son dólares por pieza. Quien no ve dinero no las recibe de la
// API y tampoco las puede escribir: si el campo quedara en pantalla, vacío,
// guardar la ficha borraría lo que cargó la dirección.
const METRICAS_CON_PLATA = new Set(["cpa", "cpm"]);

const LINK_FIELDS: { key: keyof RequirementRow; label: string }[] = [
  { key: "originalVideoLink", label: "Video original Fase 2" },
  { key: "tiktokPostLink", label: "Publicación TikTok" },
  { key: "fbPostLink", label: "Publicación FB" },
];

const CAMPO =
  "w-full border border-border rounded px-3 py-2 text-xs bg-transparent outline-none focus:border-accent";
const TARJETA = "rounded border border-white/10 bg-surface p-4";
const ROTULO = "block text-[10px] font-semibold uppercase tracking-[0.07em] text-muted mb-1";
const TITULO_SECCION = "text-[10px] font-semibold uppercase tracking-[0.07em] text-muted mb-3";

/**
 * Las listas del proceso creativo son cerradas, pero la planilla vieja trae
 * valores que ya no están en ellas. Se agrega el actual adelante en vez de
 * perderlo: abrir una pieza histórica no puede borrarle el estado que tenía.
 */
function conValorActual(lista: readonly string[], valor: string | null) {
  if (!valor || lista.includes(valor)) return lista;
  return [valor, ...lista];
}

const HOOK_TONO: Record<"bueno" | "medio" | "malo", string> = {
  bueno: "text-good",
  medio: "text-warning",
  malo: "text-critical",
};

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
  // Arranca en false: si la petición falla, la ficha se queda del lado
  // seguro en vez de dibujar dos campos vacíos donde iba plata.
  const [verCifras, setVerCifras] = useState(false);
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
          setVerCifras(Boolean(data.verCifras));
          setEditValues({
            nextAction: data.requirement.nextAction ?? "",
            notes: data.requirement.notes ?? "",
            ronda: data.requirement.ronda ?? "",
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
            date: data.requirement.date ? data.requirement.date.slice(0, 10) : "",
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
      ronda: editValues.ronda || null,
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
      date: editValues.date || null,
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

  const hookLeido = leerHookRate(
    editValues.hookRate ? Number(editValues.hookRate) : (detail?.hookRate ?? null)
  );

  const ficha = detail
    ? [
        {
          rotulo: "Producto",
          valor: detail.product ? `${detail.product.code} — ${detail.product.name}` : "Sin producto",
        },
        { rotulo: "Tipo", valor: detail.adType },
        { rotulo: "Fase", valor: detail.phase },
        { rotulo: "Formato visual", valor: detail.visualFormat },
        { rotulo: "Ángulo", valor: detail.angle },
        { rotulo: "Awareness", valor: detail.awarenessLevel },
        { rotulo: "Mercado origen", valor: detail.marketOrigin },
        {
          rotulo: "IDs",
          valor: [detail.externalId1, detail.externalId2].filter(Boolean).join(" / ") || "—",
        },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-brand-navy">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-brand-navy px-5 py-4">
          <div className="min-w-0 pr-4">
            <h2 className="truncate text-sm font-semibold text-white">
              {detail?.adName ?? "Cargando…"}
            </h2>
            {detail && (
              <p className="mt-0.5 truncate text-xs text-white/70">
                {STATUS_LABEL[detail.status] ?? detail.status}
                {detail.estado ? ` · ${detail.estado}` : ""}
                {detail.ronda ? ` · Ronda ${detail.ronda}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-xl leading-none text-white/70 transition hover:text-white"
          >
            ×
          </button>
        </div>

        {loading && <p className="p-5 text-sm text-white/70">Cargando…</p>}
        {error && (
          <p className="mx-5 mt-5 rounded border border-critical/40 bg-critical-bg px-3 py-2 text-sm text-critical">
            {error}
          </p>
        )}

        {detail && (
          <div className="flex flex-col gap-4 p-5">
            {/* La ficha sí va sobre el verde: es lo que se lee de un vistazo y
                no tiene nada que se pueda escribir mal por contraste. */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {ficha.map((f) => (
                <div key={f.rotulo}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-white/70">
                    {f.rotulo}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-white">{f.valor}</p>
                </div>
              ))}
            </div>

            <div className={TARJETA}>
              <p className={TITULO_SECCION}>Situación y responsable</p>
              <div className="flex flex-col gap-3">
                <label className="block">
                  <span className={ROTULO}>Situación en producción</span>
                  <select
                    value={detail.status}
                    onChange={(e) => patch({ status: e.target.value })}
                    disabled={saving}
                    className={CAMPO}
                  >
                    {REQUIREMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  {/* Es OTRA cosa que la situación: una pieza puede estar
                      "testeada" y ser un winner validado o un kill definitivo.
                      Faltaba en el panel, así que solo se podía cargar por API
                      — y de ahí sale el conteo de ganadores del pulso. */}
                  <span className={ROTULO}>Estado en la pauta</span>
                  <select
                    value={detail.estado ?? ""}
                    onChange={(e) => patch({ estado: e.target.value || null })}
                    disabled={saving}
                    className={CAMPO}
                  >
                    <option value="">Sin estado todavía</option>
                    {conValorActual(ESTADOS_CREATIVO, detail.estado).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>

                {canManage && (
                  <label className="block">
                    <span className={ROTULO}>Editor asignado</span>
                    <select
                      value={detail.ownerId ?? ""}
                      onChange={(e) => patch({ ownerId: e.target.value || null })}
                      disabled={saving}
                      className={CAMPO}
                    >
                      <option value="">Sin asignar</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            <div className={TARJETA}>
              <p className={TITULO_SECCION}>Producción</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={ROTULO}>Fecha de la pieza</span>
                  <input
                    type="date"
                    value={editValues.date ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, date: e.target.value }))}
                    className={CAMPO}
                  />
                </label>
                <label className="block">
                  <span className={ROTULO}>Fecha de entrega</span>
                  <input
                    type="date"
                    value={editValues.dueDate ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, dueDate: e.target.value }))}
                    className={CAMPO}
                  />
                </label>
                <label className="block">
                  <span className={ROTULO}>Ronda</span>
                  <input
                    value={editValues.ronda ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, ronda: e.target.value }))}
                    placeholder="A qué tanda de cuatro pertenece"
                    className={CAMPO}
                  />
                </label>
                <label className="block">
                  <span className={ROTULO}>Miniatura (URL)</span>
                  <input
                    value={editValues.thumbnailUrl ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, thumbnailUrl: e.target.value }))}
                    placeholder="https://…"
                    className={CAMPO}
                  />
                </label>
              </div>
              {editValues.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editValues.thumbnailUrl}
                  alt=""
                  className="mt-3 h-32 w-full rounded bg-surface-2 object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              )}
              <button
                onClick={saveFields}
                disabled={saving}
                className="mt-3 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>

            <div className={TARJETA}>
              <p className={TITULO_SECCION}>Versiones · historial de iteraciones</p>
              <div className="mb-3 flex flex-col gap-2">
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
                      <a
                        href={v.link}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono font-semibold text-accent-strong hover:underline"
                      >
                        {v.label}
                      </a>
                      <div className="flex items-center gap-2">
                        {v.isFinal ? (
                          <span className="font-medium text-good">✓ Final</span>
                        ) : (
                          canManage && (
                            <button
                              onClick={() => markVersionFinal(v.id, true)}
                              className="text-muted hover:text-accent-strong"
                            >
                              Marcar final
                            </button>
                          )
                        )}
                      </div>
                    </div>
                    {v.note && <p className="mt-1 text-muted">{v.note}</p>}
                    <p className="mt-1 font-mono text-[10px] text-muted">{v.authorName}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={sendVersion} className="flex flex-col gap-2">
                <input
                  value={versionLink}
                  onChange={(e) => setVersionLink(e.target.value)}
                  placeholder="Link de la nueva versión…"
                  className={CAMPO}
                />
                <div className="flex gap-2">
                  <input
                    value={versionNote}
                    onChange={(e) => setVersionNote(e.target.value)}
                    placeholder="Nota (opcional)"
                    className={`${CAMPO} flex-1`}
                  />
                  <button
                    type="submit"
                    disabled={sendingVersion}
                    className="rounded bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                  >
                    Subir
                  </button>
                </div>
              </form>
            </div>

            <div className={TARJETA}>
              <p className={TITULO_SECCION}>Enlaces</p>
              <div className="flex flex-col gap-2">
                {LINK_FIELDS.map((f) => (
                  <input
                    key={f.key}
                    value={editValues[f.key as string] ?? ""}
                    onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    placeholder={f.label}
                    className={CAMPO}
                  />
                ))}
              </div>
            </div>

            <div className={TARJETA}>
              <p className={TITULO_SECCION}>Métricas &amp; decisión</p>
              <div className="grid grid-cols-2 gap-3">
                {METRIC_FIELDS.filter(
                  (f) => verCifras || !METRICAS_CON_PLATA.has(f.key as string)
                ).map((f) => (
                  <label key={f.key} className="block">
                    <span className={ROTULO}>
                      {f.label}
                      {f.suffix ? ` (${f.suffix})` : ""}
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={editValues[f.key as string] ?? ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      className={CAMPO}
                    />
                    {/* El hook rate no se lee igual en todos los tramos, y la
                        regla ya estaba escrita en pipeline-options sin que
                        ninguna pantalla la mostrara. */}
                    {f.key === "hookRate" && hookLeido && (
                      <span className={`mt-1 block text-[10px] ${HOOK_TONO[hookLeido.tono]}`}>
                        {hookLeido.texto}
                      </span>
                    )}
                  </label>
                ))}
              </div>
              <label className="mt-3 block">
                <span className={ROTULO}>Próxima acción</span>
                <select
                  value={editValues.nextAction ?? ""}
                  onChange={(e) => setEditValues((v) => ({ ...v, nextAction: e.target.value }))}
                  className={CAMPO}
                >
                  <option value="">Sin definir</option>
                  {conValorActual(PROXIMAS_ACCIONES, detail.nextAction).map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block">
                <span className={ROTULO}>Notas / aprendizaje</span>
                <textarea
                  value={editValues.notes ?? ""}
                  onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                  rows={3}
                  className={CAMPO}
                />
              </label>
              <button
                onClick={saveFields}
                disabled={saving}
                className="mt-3 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>

            <div className={TARJETA}>
              <p className={TITULO_SECCION}>Actividad</p>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto">
                {detail.activity.length === 0 && (
                  <p className="text-xs text-muted">Sin cambios registrados todavía.</p>
                )}
                {detail.activity.map((a) => (
                  <div key={a.id} className="flex items-baseline gap-2 text-xs">
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {new Date(a.createdAt).toLocaleDateString("es-EC", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                    <span>
                      <span className="font-medium">{a.actorName}</span>{" "}
                      <span className="text-muted">{a.detail}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={TARJETA}>
              <p className={TITULO_SECCION}>Chat interno · usa @nombre para mencionar</p>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {detail.comments.length === 0 && (
                  <p className="text-xs text-muted">Todavía no hay comentarios.</p>
                )}
                {detail.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`max-w-[85%] rounded px-3 py-2 text-xs ${
                      c.author.id === currentUserId
                        ? "self-end bg-accent text-white"
                        : "self-start bg-surface-2"
                    }`}
                  >
                    <p className="mb-0.5 font-mono opacity-70">{c.author.name}</p>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={sendComment} className="mt-3 flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escribe un comentario… @Valentina"
                  className={`${CAMPO} flex-1`}
                />
                <button
                  type="submit"
                  disabled={sendingComment}
                  className="rounded bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
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
