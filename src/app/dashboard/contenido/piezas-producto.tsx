"use client";

import { useMemo, useState } from "react";
import {
  AD_TYPES,
  ANGLES,
  AWARENESS_LEVELS,
  MARKET_ORIGINS,
  PHASES,
  REQUIREMENT_STATUSES,
  STATUS_LABEL,
  VISUAL_FORMATS,
} from "@/lib/pipeline-options";
import type { RequirementRow, UserOption } from "../_creativos/types";

// Las piezas de un producto, editables en la misma fila.
//
// Es la planilla de Super Ads —anuncio, tipo, fase, formato visual, ángulo,
// awareness, mercado, situación— con la mecánica del día a día: se toca la
// celda, se elige, se guarda sola. La fila de abajo crea una pieza nueva con
// solo escribir el nombre. Así es como los responsables suben sus cinco piezas
// del día sin abrir un formulario por cada una.
//
// DOS REGLAS VISIBLES
// - El formato visual no se repite dentro de un mismo adset: los formatos que
//   ya usa otra pieza del mismo adset aparecen tachados en el desplegable. La
//   base lo rechaza igual si alguien lo intenta, pero es mejor no ofrecerlo.
// - Lo que falta clasificar se ve en ámbar. Es lo que el aviso de las ocho le
//   reclama al responsable del producto.

export type ProductoFicha = {
  id: string;
  code: string;
  name: string;
  angulosPropios: string[];
  responsables: { id: string; name: string }[];
  /** Tuvo gasto publicitario en los últimos treinta días. */
  pautado?: boolean;
};

const CLASIFICACION = ["adType", "phase", "visualFormat", "angle", "awarenessLevel", "marketOrigin"] as const;

/** Cuántos campos de clasificación le faltan a una pieza. */
export function faltantes(r: RequirementRow) {
  return CLASIFICACION.filter((c) => !String(r[c] ?? "").trim()).length;
}

/** El adset de una pieza: su ronda, o si no tiene, su día. */
function adsetDe(r: RequirementRow) {
  if (r.ronda?.trim()) return `r:${r.ronda.trim()}`;
  // El día de Ecuador, igual que lo cuenta el servidor: una pieza creada a
  // las 20:00 es del mismo día que las de la mañana, aunque en UTC ya sea el
  // siguiente.
  const dia = new Date(new Date(r.date).getTime() - 5 * 3600_000).toISOString().slice(0, 10);
  return `d:${dia}`;
}

function fechaCorta(iso: string) {
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "America/Guayaquil" });
}

const CELDA = "px-1.5 py-1 align-middle";

/** Un select que se ve como texto hasta que se lo toca. */
function Celda({
  valor,
  opciones,
  bloqueadas,
  onGuardar,
  editable,
  vacio = "—",
  extra,
}: {
  valor: string;
  opciones: readonly string[];
  bloqueadas?: Set<string>;
  onGuardar: (v: string) => void;
  editable: boolean;
  vacio?: string;
  /** Una opción al final que no es un valor: "+ Agregar ángulo…". */
  extra?: { texto: string; accion: () => void };
}) {
  const falta = !valor.trim();
  if (!editable) {
    return <span className={`block truncate text-xs ${falta ? "text-muted" : ""}`}>{valor || vacio}</span>;
  }
  return (
    <select
      value={valor}
      onChange={(e) => {
        if (e.target.value === "__extra__") {
          extra?.accion();
          return;
        }
        onGuardar(e.target.value);
      }}
      className={`w-full max-w-[190px] cursor-pointer truncate rounded border px-1.5 py-1 text-xs outline-none transition focus:border-accent ${
        falta ? "border-warning/60 bg-pending-bg/40 text-warning" : "border-transparent hover:border-border"
      }`}
    >
      <option value="">{falta ? "Elegir…" : vacio}</option>
      {opciones.map((o) => {
        const tomada = bloqueadas?.has(o) && o !== valor;
        return (
          <option key={o} value={o} disabled={tomada}>
            {tomada ? `${o} · ya en el adset` : o}
          </option>
        );
      })}
      {extra && <option value="__extra__">{extra.texto}</option>}
    </select>
  );
}

export default function PiezasProducto({
  producto,
  piezas,
  users,
  canManage,
  puedeEditar,
  currentUserId,
  onCambio,
  onAbrir,
  onAngulo,
}: {
  producto: ProductoFicha;
  piezas: RequirementRow[];
  users: UserOption[];
  canManage: boolean;
  /** Dirección o responsable del producto: puede tocar TODAS las piezas. */
  puedeEditar: boolean;
  /** Quién está mirando, para las piezas que tiene asignadas a su nombre. */
  currentUserId: string;
  onCambio: (r: RequirementRow) => void;
  onAbrir: (id: string) => void;
  onAngulo: (angulo: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [tope, setTope] = useState(25);

  const ordenadas = useMemo(
    () => [...piezas].sort((a, b) => b.date.localeCompare(a.date)),
    [piezas],
  );

  // Qué formatos usa cada adset, para no ofrecerlos dos veces.
  const formatosPorAdset = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const r of piezas) {
      if (!r.visualFormat) continue;
      const k = adsetDe(r);
      const mapa = m.get(k) ?? new Map<string, string>();
      mapa.set(r.visualFormat, r.id);
      m.set(k, mapa);
    }
    return m;
  }, [piezas]);

  const angulos = useMemo(
    () => [...ANGLES, ...producto.angulosPropios.filter((a) => !(ANGLES as readonly string[]).includes(a))],
    [producto.angulosPropios],
  );

  async function guardar(r: RequirementRow, campo: string, valor: string) {
    setError(null);
    const anterior = r;
    onCambio({ ...r, [campo]: valor } as RequirementRow);
    try {
      const res = await fetch(`/api/requirements/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      onCambio({ ...r, ...j.requirement });
    } catch (e) {
      onCambio(anterior);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function crear(adName: string) {
    if (!adName.trim()) return;
    setCreando(false);
    setError(null);
    try {
      const res = await fetch("/api/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rapida: true, productId: producto.id, adName: adName.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      onCambio(j.requirement);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function agregarAngulo(r: RequirementRow) {
    const nuevo = window.prompt(`Nuevo ángulo para ${producto.name}:`)?.trim();
    if (!nuevo) return;
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(producto.code)}/angulos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angulo: nuevo }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      onAngulo(j.angulo);
      await guardar(r, "angle", j.angulo);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const opcionesEditor = users.map((u) => u.name);
  const statusOpciones = REQUIREMENT_STATUSES.map((s) => STATUS_LABEL[s] ?? s);

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-lg border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">{error}</p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-border bg-surface-2/40">
            <tr className="text-left text-[11px] text-muted">
              <th className="px-2 py-2 font-medium">Fecha</th>
              <th className="px-2 py-2 font-medium">Anuncio</th>
              <th className="px-2 py-2 font-medium">Tipo</th>
              <th className="px-2 py-2 font-medium">Fase</th>
              <th className="px-2 py-2 font-medium" title="Dentro de un adset, cada pieza lleva un formato distinto">
                Adset
              </th>
              <th className="px-2 py-2 font-medium">Formato visual</th>
              <th className="px-2 py-2 font-medium">Ángulo</th>
              <th className="px-2 py-2 font-medium">Awareness</th>
              <th className="px-2 py-2 font-medium">Mercado</th>
              <th className="px-2 py-2 font-medium">Situación</th>
              <th className="px-2 py-2 font-medium">Editor</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.slice(0, tope).map((r) => {
              // QUIÉN PUEDE LLENAR ESTA FILA
              //
              // Dos caminos, no uno: dirección y los responsables del producto
              // pueden con todas, y además cada quien puede con las piezas que
              // tiene asignadas a su nombre, sea responsable del producto o no.
              //
              // Faltaba el segundo. Majo: "cuando asigno a alguien que no es
              // responsable de producto, pero ese día hará contenido del
              // producto, no le da opción para llenar lo de control super
              // ads". Es un caso normal —alguien cubre un producto por un día—
              // y quedaba en un lugar sin salida: la pieza aparecía a su
              // nombre, con todo en "—", y no había forma de completarla ni de
              // saber por qué.
              //
              // El servidor ya lo permitía (puedeTocarPieza acepta al dueño de
              // la pieza); la que era más estricta era esta pantalla. Los
              // permisos partidos entre el cliente y el servidor se separan
              // así, en silencio y para el lado que no se nota hasta que
              // alguien no puede trabajar.
              //
              // Reasignar la pieza a otra persona sigue siendo de dirección
              // —la columna Editor va por canManage—, igual que en el PATCH.
              const editable = puedeEditar || r.ownerId === currentUserId;
              const usados = formatosPorAdset.get(adsetDe(r));
              const bloqueados = new Set([...(usados?.entries() ?? [])].filter(([, id]) => id !== r.id).map(([f]) => f));
              return (
                <tr key={r.id} className="border-b border-border/60 last:border-b-0 hover:bg-surface-2/30">
                  <td className={`${CELDA} whitespace-nowrap text-xs text-muted`}>{fechaCorta(r.date)}</td>
                  <td className={CELDA}>
                    <span className="block max-w-[200px] truncate text-xs font-medium" title={r.adName}>
                      {r.adName}
                    </span>
                  </td>
                  <td className={CELDA}>
                    <Celda valor={r.adType} opciones={AD_TYPES} editable={editable} onGuardar={(v) => guardar(r, "adType", v)} />
                  </td>
                  <td className={CELDA}>
                    <Celda valor={r.phase} opciones={PHASES} editable={editable} onGuardar={(v) => guardar(r, "phase", v)} />
                  </td>
                  <td className={CELDA}>
                    {editable ? (
                      <input
                        key={r.ronda ?? ""}
                        defaultValue={r.ronda ?? ""}
                        placeholder="—"
                        onBlur={(e) => {
                          if ((e.target.value.trim() || null) !== (r.ronda?.trim() || null)) guardar(r, "ronda", e.target.value.trim());
                        }}
                        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                        className="w-16 rounded border border-transparent px-1.5 py-1 text-xs outline-none hover:border-border focus:border-accent"
                      />
                    ) : (
                      <span className="text-xs">{r.ronda || "—"}</span>
                    )}
                  </td>
                  <td className={CELDA}>
                    <Celda
                      valor={r.visualFormat}
                      opciones={VISUAL_FORMATS}
                      bloqueadas={bloqueados}
                      editable={editable}
                      onGuardar={(v) => guardar(r, "visualFormat", v)}
                    />
                  </td>
                  <td className={CELDA}>
                    <Celda
                      valor={r.angle}
                      opciones={angulos}
                      editable={editable}
                      onGuardar={(v) => guardar(r, "angle", v)}
                      extra={{ texto: "+ Agregar ángulo de este producto…", accion: () => agregarAngulo(r) }}
                    />
                  </td>
                  <td className={CELDA}>
                    <Celda valor={r.awarenessLevel} opciones={AWARENESS_LEVELS} editable={editable} onGuardar={(v) => guardar(r, "awarenessLevel", v)} />
                  </td>
                  <td className={CELDA}>
                    <Celda valor={r.marketOrigin} opciones={MARKET_ORIGINS} editable={editable} onGuardar={(v) => guardar(r, "marketOrigin", v)} />
                  </td>
                  <td className={CELDA}>
                    <Celda
                      valor={STATUS_LABEL[r.status] ?? r.status}
                      opciones={statusOpciones}
                      editable={editable}
                      onGuardar={(v) => {
                        const clave = REQUIREMENT_STATUSES.find((s) => (STATUS_LABEL[s] ?? s) === v);
                        if (clave) guardar(r, "status", clave);
                      }}
                    />
                  </td>
                  <td className={CELDA}>
                    <Celda
                      valor={r.owner?.name ?? ""}
                      opciones={opcionesEditor}
                      editable={canManage}
                      vacio="Sin asignar"
                      onGuardar={(v) => {
                        const u = users.find((x) => x.name === v);
                        guardar(r, "ownerId", u?.id ?? "");
                      }}
                    />
                  </td>
                  <td className={`${CELDA} text-right`}>
                    <button
                      type="button"
                      onClick={() => onAbrir(r.id)}
                      className="rounded px-1.5 py-1 text-xs text-muted transition hover:bg-surface-2 hover:text-foreground"
                      title="Abrir el detalle: enlaces, métricas, versiones y comentarios"
                    >
                      ···
                    </button>
                  </td>
                </tr>
              );
            })}

            {puedeEditar && (
              <tr className="border-t border-border">
                <td colSpan={12} className="px-2 py-1.5">
                  {creando ? (
                    <input
                      autoFocus
                      placeholder="Nombre del anuncio y Enter — el resto se completa en la fila"
                      onBlur={(e) => crear(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") setCreando(false);
                      }}
                      className="w-full rounded border border-accent bg-surface px-2 py-1.5 text-xs outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCreando(true)}
                      className="w-full rounded px-1 py-1 text-left text-xs text-muted transition hover:bg-surface-2 hover:text-foreground"
                    >
                      + Nueva pieza de {producto.name}
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {ordenadas.length > tope && (
        <button
          type="button"
          onClick={() => setTope((t) => t + 25)}
          className="self-center rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
        >
          Ver 25 más · quedan {ordenadas.length - tope}
        </button>
      )}
    </div>
  );
}
