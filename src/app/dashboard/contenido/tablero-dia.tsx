"use client";

import { useMemo, useState } from "react";
import { ESTADOS_TAREA, ESTADO_TAREA_LABEL, PLATAFORMAS, PLATAFORMA_LABEL } from "@/lib/contenido-opciones";

type UserOption = { id: string; name: string };
type ProductOption = { id: string; code: string; name: string };

type Tarea = {
  id: string;
  fecha: string | null;
  ownerId: string | null;
  responsableTexto: string | null;
  owner: UserOption | null;
  productId: string | null;
  productoTexto: string | null;
  product: ProductOption | null;
  plataforma: string | null;
  campanaTiktok: boolean;
  campanaMeta: boolean;
  numeroCreativos: number;
  estado: string;
  etiquetas: string[];
  notas: string | null;
  loteId: string | null;
  lote: { id: string; numero: number; nomenclatura: string | null } | null;
  createdAt: string;
};

const CAMPO = "border border-border rounded px-2 py-1.5 text-xs bg-transparent outline-none focus:border-accent";

function fechaLegible(iso: string | null) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-EC", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function hoyInput() {
  const now = new Date();
  const local = new Date(now.getTime() - 5 * 3600_000); // Ecuador, UTC-5
  return local.toISOString().slice(0, 10);
}

export default function TableroDia({
  canManage,
  currentUserId,
  users,
  products,
  initialTareas,
}: {
  canManage: boolean;
  currentUserId: string;
  users: UserOption[];
  products: ProductOption[];
  initialTareas: Tarea[];
}) {
  const [tareas, setTareas] = useState<Tarea[]>(initialTareas);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const [filtroPersona, setFiltroPersona] = useState("");
  const [filtroPlataforma, setFiltroPlataforma] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  const [form, setForm] = useState({
    fecha: hoyInput(),
    ownerId: currentUserId,
    productoTexto: "",
    productId: "",
    plataforma: "" as string,
    campanaTiktok: false,
    campanaMeta: false,
    numeroCreativos: 0,
    estado: "PENDIENTE" as string,
    notas: "",
  });

  const filtradas = useMemo(() => {
    return tareas.filter((t) => {
      if (filtroPersona && t.ownerId !== filtroPersona) return false;
      if (filtroPlataforma && t.plataforma !== filtroPlataforma) return false;
      if (filtroEstado && t.estado !== filtroEstado) return false;
      return true;
    });
  }, [tareas, filtroPersona, filtroPlataforma, filtroEstado]);

  const porDia = useMemo(() => {
    const grupos = new Map<string, Tarea[]>();
    for (const t of filtradas) {
      const clave = t.fecha ? t.fecha.slice(0, 10) : "sin-fecha";
      const lista = grupos.get(clave) ?? [];
      lista.push(t);
      grupos.set(clave, lista);
    }
    return [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtradas]);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/contenido/tareas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha: form.fecha,
          ownerId: canManage ? form.ownerId || null : currentUserId,
          productId: form.productId || null,
          productoTexto: form.productId ? null : form.productoTexto.trim() || null,
          plataforma: form.plataforma || null,
          campanaTiktok: form.campanaTiktok,
          campanaMeta: form.campanaMeta,
          numeroCreativos: form.numeroCreativos,
          estado: form.estado,
          notas: form.notas.trim() || null,
        }),
      });
      const data = (await res.json()) as { tarea?: Tarea; error?: string };
      if (!res.ok || !data.tarea) {
        setError(data.error ?? "No se pudo crear la tarea.");
        return;
      }
      setTareas((prev) => [data.tarea as Tarea, ...prev]);
      setForm((f) => ({ ...f, productoTexto: "", productId: "", numeroCreativos: 0, notas: "" }));
      setAbierto(false);
    } catch {
      setError("No se pudo crear la tarea. Revisa la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  async function actualizar(id: string, cambios: Record<string, unknown>) {
    const anterior = tareas;
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, ...cambios } as Tarea : t)));
    try {
      const res = await fetch(`/api/contenido/tareas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      if (!res.ok) {
        setTareas(anterior);
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No se pudo guardar el cambio.");
        return;
      }
      const data = (await res.json()) as { tarea: Tarea };
      setTareas((prev) => prev.map((t) => (t.id === id ? data.tarea : t)));
    } catch {
      setTareas(anterior);
      setError("No se pudo guardar el cambio. Revisa la conexión.");
    }
  }

  async function borrar(id: string) {
    if (!confirm("¿Borrar esta tarea?")) return;
    const anterior = tareas;
    setTareas((prev) => prev.filter((t) => t.id !== id));
    const res = await fetch(`/api/contenido/tareas/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setTareas(anterior);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo borrar la tarea.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={filtroPersona} onChange={(e) => setFiltroPersona(e.target.value)} className={CAMPO}>
          <option value="">Todas las personas</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={filtroPlataforma} onChange={(e) => setFiltroPlataforma(e.target.value)} className={CAMPO}>
          <option value="">Todas las plataformas</option>
          {PLATAFORMAS.map((p) => (
            <option key={p} value={p}>
              {PLATAFORMA_LABEL[p]}
            </option>
          ))}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className={CAMPO}>
          <option value="">Todos los estados</option>
          {ESTADOS_TAREA.map((s) => (
            <option key={s} value={s}>
              {ESTADO_TAREA_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setAbierto((v) => !v)}
          className="ml-auto rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
        >
          {abierto ? "Cancelar" : "Nueva tarea"}
        </button>
      </div>

      {abierto && (
        <form onSubmit={crear} className="flex flex-col gap-2 rounded border border-border bg-surface-2/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className={CAMPO}
            />
            {canManage && (
              <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className={CAMPO}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <select
              value={form.productId}
              onChange={(e) => setForm({ ...form, productId: e.target.value })}
              className={CAMPO}
            >
              <option value="">Producto (elegir del catálogo)…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {!form.productId && (
              <input
                value={form.productoTexto}
                onChange={(e) => setForm({ ...form, productoTexto: e.target.value })}
                placeholder="o el nombre del producto"
                className={CAMPO}
              />
            )}
            <select value={form.plataforma} onChange={(e) => setForm({ ...form, plataforma: e.target.value })} className={CAMPO}>
              <option value="">Plataforma…</option>
              {PLATAFORMAS.map((p) => (
                <option key={p} value={p}>
                  {PLATAFORMA_LABEL[p]}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              value={form.numeroCreativos}
              onChange={(e) => setForm({ ...form, numeroCreativos: Number(e.target.value) })}
              placeholder="# creativos"
              className={`${CAMPO} w-28`}
            />
            <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className={CAMPO}>
              {ESTADOS_TAREA.map((s) => (
                <option key={s} value={s}>
                  {ESTADO_TAREA_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={form.campanaTiktok}
                onChange={(e) => setForm({ ...form, campanaTiktok: e.target.checked })}
              />
              Realizar campaña TikTok
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={form.campanaMeta}
                onChange={(e) => setForm({ ...form, campanaMeta: e.target.checked })}
              />
              Realizar campaña Meta
            </label>
          </div>
          <textarea
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            rows={2}
            placeholder="Notas — qué falta, qué quedó pendiente…"
            className="w-full resize-y rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={enviando}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
            >
              {enviando ? "Guardando…" : "Crear tarea"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">{error}</p>
      )}

      {porDia.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">Todavía no hay tareas cargadas.</p>
        </div>
      ) : (
        porDia.map(([clave, delDia]) => (
          <div key={clave} className="overflow-hidden rounded border border-border bg-surface">
            <div className="border-b border-border bg-surface-2/60 px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {clave === "sin-fecha" ? "Sin fecha" : fechaLegible(delDia[0].fecha)}
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Responsable</th>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2">Plataforma</th>
                    <th className="px-3 py-2">Lote</th>
                    <th className="px-3 py-2">Creativos</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Notas</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {delDia.map((t) => {
                    const puedeEditar = canManage || t.ownerId === currentUserId;
                    return (
                      <tr key={t.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2 whitespace-nowrap">{t.owner?.name ?? t.responsableTexto ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{t.product?.name ?? t.productoTexto ?? "—"}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {t.plataforma ? PLATAFORMA_LABEL[t.plataforma as never] ?? t.plataforma : "—"}
                          {(t.campanaTiktok || t.campanaMeta) && (
                            <span className="ml-1 text-[10px] text-muted">
                              {t.campanaTiktok && "· TikTok "}
                              {t.campanaMeta && "· Meta"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap font-mono">{t.lote?.nomenclatura ?? "—"}</td>
                        <td className="px-3 py-2">{t.numeroCreativos}</td>
                        <td className="px-3 py-2">
                          {puedeEditar ? (
                            <select
                              value={t.estado}
                              onChange={(e) => actualizar(t.id, { estado: e.target.value })}
                              className={CAMPO}
                            >
                              {ESTADOS_TAREA.map((s) => (
                                <option key={s} value={s}>
                                  {ESTADO_TAREA_LABEL[s]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            ESTADO_TAREA_LABEL[t.estado as never] ?? t.estado
                          )}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 text-muted" title={t.notas ?? ""}>
                          {t.notas ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {(canManage || t.ownerId === currentUserId) && (
                            <button
                              onClick={() => borrar(t.id)}
                              title="Borrar"
                              className="text-muted transition hover:text-critical"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
