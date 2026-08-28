"use client";

import { useState } from "react";
import Link from "next/link";
import { type PulseTone } from "./pulse-line";
import ProductConfig from "./product-config";

export type Sugerencia = { kind: string; detail: string; reason: string };

export type PulsoConAcciones = {
  productId: string | null;
  code: string | null;
  name: string;
  score: number;
  state: PulseTone;
  spend: number;
  purchases: number;
  cpa: number | null;
  cpaTarget: number | null;
  salePrice?: number | null;
  unitCost?: number | null;
  serie: number[];
  motivos: string[];
  sugerencias: Sugerencia[];
};

export type Persona = { id: string; name: string; role: string };

export type Pendiente = {
  id: string;
  kind: string;
  detail: string;
  cantidad: number | null;
  reason: string;
  createdAt: string;
  product: { id: string; code: string; name: string };
  proposedBy: { id: string; name: string };
};

const money = (n: number | null, dec = 2) =>
  n == null
    ? "—"
    : n.toLocaleString("es-EC", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: dec,
      });

const ETIQUETA_TIPO: Record<string, string> = {
  MAS_CREATIVOS: "Creativos nuevos",
  ESCALAR: "Escalar",
  PAUSAR: "Pausar",
  REVISAR_OFERTA: "Revisar oferta",
};

/**
 * El estado de un producto, abierto ahí mismo.
 *
 * Antes tocar un producto del pulso llevaba a otra pantalla, y para volver a
 * comparar contra el resto había que volver atrás. Aquí se despliega debajo: qué
 * dice el número, por qué, y qué se puede hacer al respecto sin moverse.
 */
export function DetalleProducto({
  p,
  onProponer,
  onCerrar,
  puedeConfigurar = false,
  onCambio,
}: {
  p: PulsoConAcciones;
  onProponer: (s: Sugerencia, cantidad: number) => Promise<void>;
  /** Cerrar el detalle. Sin un control visible, quien lo abre queda sin
   *  saber como volver a la lista. */
  onCerrar?: () => void;
  /** Quien puede tocar precio, costo y CPA objetivo. */
  puedeConfigurar?: boolean;
  /** Para volver a pedir los datos cuando cambian los umbrales. */
  onCambio?: () => void;
}) {
  const [eligiendo, setEligiendo] = useState<Sugerencia | null>(null);
  const [cantidad, setCantidad] = useState(3);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function proponer() {
    if (!eligiendo) return;
    setEnviando(true);
    try {
      await onProponer(eligiendo, cantidad);
      setAviso("Queda esperando aprobación de dirección.");
      setEligiendo(null);
    } catch (err) {
      setAviso(err instanceof Error ? err.message : "No se pudo proponer.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-surface-2/40 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium">{p.name}</p>
        {onCerrar && (
          <button
            onClick={onCerrar}
            className="shrink-0 rounded border border-border px-2 py-0.5 text-xs text-muted transition hover:border-border-strong hover:text-foreground"
          >
            Cerrar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Gasto", valor: money(p.spend, 0) },
          { label: "Compras", valor: p.purchases.toLocaleString("es-EC") },
          { label: "CPA", valor: money(p.cpa) },
          { label: "CPA objetivo", valor: money(p.cpaTarget) },
        ].map((d) => (
          <div key={d.label}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              {d.label}
            </p>
            <p className="tabular-nums">{d.valor}</p>
          </div>
        ))}
      </div>

      {p.motivos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {p.motivos.map((m, i) => (
            <li key={i} className="flex gap-2 text-xs leading-relaxed text-muted">
              <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      )}

      {puedeConfigurar && p.productId && (
        <ProductConfig
          inicial={{
            productId: p.productId,
            cpaTarget: p.cpaTarget,
            salePrice: p.salePrice ?? null,
            unitCost: p.unitCost ?? null,
          }}
          puedeEditar
          onGuardado={onCambio}
        />
      )}

      {p.sugerencias.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
            Qué se puede hacer
          </p>
          <div className="flex flex-col gap-1.5">
            {p.sugerencias.map((s) => (
              <button
                key={s.kind + s.detail}
                onClick={() => {
                  setEligiendo(eligiendo?.detail === s.detail ? null : s);
                  setAviso(null);
                }}
                className={`rounded border px-2.5 py-2 text-left transition ${
                  eligiendo?.detail === s.detail
                    ? "border-accent bg-good-bg"
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {ETIQUETA_TIPO[s.kind] ?? s.kind}
                  </span>
                  <span className="text-sm">{s.detail}</span>
                </span>
                <span className="mt-0.5 block text-xs text-muted">{s.reason}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {eligiendo && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-border bg-surface p-2.5">
          {eligiendo.kind === "MAS_CREATIVOS" && (
            <label className="text-xs">
              <span className="mb-1 block font-semibold uppercase tracking-[0.07em] text-muted">
                Cuántas piezas
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
                className="w-20 rounded border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent"
              />
            </label>
          )}
          <button
            onClick={proponer}
            disabled={enviando}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
          >
            {enviando ? "Proponiendo…" : "Proponer a dirección"}
          </button>
          <button
            onClick={() => setEligiendo(null)}
            className="text-xs text-muted transition hover:text-foreground"
          >
            Cancelar
          </button>
        </div>
      )}

      {aviso && <p className="text-xs text-accent-strong">{aviso}</p>}

      {p.code && (
        <Link
          href={`/dashboard/productos/${encodeURIComponent(p.code)}`}
          className="text-xs text-muted underline underline-offset-2 transition hover:text-foreground"
        >
          Ver la ficha completa y sus creativos
        </Link>
      )}
    </div>
  );
}

/**
 * La cola de aprobación. Solo la ve quien puede decidir, y se muestra arriba
 * de todo cuando hay algo esperando: una propuesta que nadie mira es una
 * propuesta perdida.
 */
export function ColaDeAprobacion({
  pendientes,
  equipo,
  onDecidir,
}: {
  pendientes: Pendiente[];
  equipo: Persona[];
  onDecidir: (
    id: string,
    decision: "aprobar" | "rechazar",
    extra: { assigneeId?: string; dueDate?: string; nota?: string }
  ) => Promise<void>;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendientes.length === 0) return null;

  async function decidir(id: string, decision: "aprobar" | "rechazar") {
    setOcupado(true);
    setError(null);
    try {
      await onDecidir(id, decision, {
        assigneeId: assigneeId || undefined,
        dueDate: dueDate || undefined,
        nota: nota || undefined,
      });
      setAbierta(null);
      setAssigneeId("");
      setDueDate("");
      setNota("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded border border-warning/40 bg-surface">
      <p className="border-b border-border px-3 py-2 text-xs font-medium text-warning">
        {pendientes.length}{" "}
        {pendientes.length === 1 ? "acción espera" : "acciones esperan"} tu aprobación
      </p>

      <div className="flex flex-col">
        {pendientes.map((a) => {
          const abierto = abierta === a.id;
          return (
            <div key={a.id} className="border-b border-border last:border-b-0">
              <button
                onClick={() => {
                  setAbierta(abierto ? null : a.id);
                  setError(null);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-surface-2"
              >
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
                  {ETIQUETA_TIPO[a.kind] ?? a.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {a.product.name}
                    {a.cantidad ? ` · ${a.cantidad} piezas` : ""}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {a.detail} · lo pidió {a.proposedBy.name}
                  </span>
                </span>
              </button>

              {abierto && (
                <div className="flex flex-col gap-2 border-t border-border bg-surface-2/40 px-3 py-3">
                  <p className="text-xs text-muted">{a.reason}</p>

                  {a.kind === "MAS_CREATIVOS" && (
                    <div className="flex flex-wrap gap-2">
                      <label className="text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-[0.07em] text-muted">
                          Quién lo hace
                        </span>
                        <select
                          value={assigneeId}
                          onChange={(e) => setAssigneeId(e.target.value)}
                          className="rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
                        >
                          <option value="">— Elegir —</option>
                          {equipo.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs">
                        <span className="mb-1 block font-semibold uppercase tracking-[0.07em] text-muted">
                          Para cuándo
                        </span>
                        <input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
                        />
                      </label>
                    </div>
                  )}

                  <input
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Nota para el equipo (opcional)"
                    className="rounded border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />

                  {error && <p className="text-xs text-critical">{error}</p>}

                  <div className="flex gap-2">
                    <button
                      onClick={() => decidir(a.id, "aprobar")}
                      disabled={ocupado}
                      className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
                    >
                      {a.kind === "MAS_CREATIVOS" ? "Aprobar y agendar" : "Aprobar"}
                    </button>
                    <button
                      onClick={() => decidir(a.id, "rechazar")}
                      disabled={ocupado}
                      className="rounded border border-border px-3 py-1.5 text-xs text-muted transition hover:border-critical hover:text-critical disabled:opacity-40"
                    >
                      Rechazar
                    </button>
                  </div>

                  {a.kind === "MAS_CREATIVOS" && (
                    <p className="text-[11px] text-muted">
                      Al aprobar nacen {a.cantidad ?? 1}{" "}
                      {(a.cantidad ?? 1) === 1 ? "requerimiento" : "requerimientos"} en el Pipeline,
                      ya asignados, y a esa persona le llega el aviso.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
