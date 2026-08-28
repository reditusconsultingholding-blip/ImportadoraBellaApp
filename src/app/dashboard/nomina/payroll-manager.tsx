"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PayrollLine } from "@/lib/payroll";

const MODE_LABEL: Record<string, string> = {
  SEMANAL: "Semanal fijo",
  DIARIO: "Por día",
  POR_PIEZA: "Por pieza entregada",
};

const money = (n: number, currency: string) =>
  n.toLocaleString("es-EC", { style: "currency", currency, maximumFractionDigits: 2 });

type Day = { iso: string; label: string; dayNumber: number };

export default function PayrollManager({
  weekStartISO,
  weekTitle,
  prevISO,
  nextISO,
  days,
  lines,
  total,
  status,
  paidAt,
  paidByName,
}: {
  weekStartISO: string;
  weekTitle: string;
  prevISO: string;
  nextISO: string;
  days: Day[];
  lines: PayrollLine[];
  total: number;
  status: string;
  paidAt: string | null;
  paidByName: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paid = status === "PAGADA";

  // Copia local editable de los montos, para que el input no "salte" mientras
  // el servidor recalcula.
  const [draft, setDraft] = useState<Record<string, { payAmount: string; daysPerWeek: string }>>(
    Object.fromEntries(
      lines.map((l) => [l.employeeId, { payAmount: String(l.payAmount), daysPerWeek: String(l.daysPerWeek) }])
    )
  );

  async function saveEmployee(employeeId: string, patch: Record<string, unknown>) {
    setBusyId(employeeId);
    setError(null);
    const res = await fetch(`/api/nomina/empleados/${employeeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function toggleAbsence(employeeId: string, date: string) {
    if (paid) return;
    setBusyId(employeeId);
    setError(null);
    const res = await fetch("/api/nomina/ausencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, date }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo marcar el día.");
      return;
    }
    startTransition(() => router.refresh());
  }

  async function markPaid() {
    if (!confirm(`¿Cerrar la semana ${weekTitle} y marcarla como pagada? Los montos quedan congelados.`))
      return;
    setError(null);
    const res = await fetch("/api/nomina/pagar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: weekStartISO }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo cerrar la semana.");
      return;
    }
    startTransition(() => router.refresh());
  }

  const currency = lines[0]?.currency ?? "USD";
  const inputClass =
    "w-24 bg-transparent border border-border rounded px-2 py-1 text-sm outline-none focus:border-accent tabular-nums";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-border rounded p-4">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/nomina?semana=${prevISO}`}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-surface-2 transition"
          >
            ← Semana anterior
          </Link>
          <span className="font-medium text-sm">{weekTitle}</span>
          <Link
            href={`/dashboard/nomina?semana=${nextISO}`}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-surface-2 transition"
          >
            Semana siguiente →
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {paid ? (
            <span className="font-mono text-xs px-3 py-1.5 rounded bg-good-bg text-good">
              Pagada{paidByName ? ` por ${paidByName}` : ""}
              {paidAt ? ` · ${new Date(paidAt).toLocaleDateString("es-EC")}` : ""}
            </span>
          ) : (
            <button
              onClick={markPaid}
              disabled={pending}
              className="text-xs font-medium bg-accent text-white rounded px-3 py-1.5 disabled:opacity-60"
            >
              Marcar semana como pagada
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-surface border border-border rounded overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Persona</th>
              <th className="px-4 py-3">Forma de pago</th>
              <th className="px-4 py-3 text-right">Monto</th>
              <th className="px-4 py-3 text-center">Días de la semana</th>
              <th className="px-4 py-3 text-right">Piezas</th>
              <th className="px-4 py-3 text-right">Descuento</th>
              <th className="px-4 py-3 text-right">A pagar</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.employeeId} className={`border-t border-border ${busyId === l.employeeId ? "opacity-60" : ""}`}>
                <td className="px-4 py-3">
                  <p className="font-medium">{l.fullName}</p>
                  <p className="text-xs text-muted">{l.position}</p>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={l.payMode}
                    disabled={paid}
                    onChange={(e) => saveEmployee(l.employeeId, { payMode: e.target.value })}
                    className="bg-transparent border border-border rounded px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-60"
                  >
                    {Object.entries(MODE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-right">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={paid}
                    className={`${inputClass} text-right disabled:opacity-60`}
                    value={draft[l.employeeId]?.payAmount ?? String(l.payAmount)}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [l.employeeId]: { ...d[l.employeeId], payAmount: e.target.value },
                      }))
                    }
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (Number.isFinite(value) && value !== l.payAmount) {
                        saveEmployee(l.employeeId, { payAmount: value });
                      }
                    }}
                  />
                  {l.payMode !== "POR_PIEZA" && (
                    <span className="block text-xs text-muted mt-1">
                      {l.payMode === "SEMANAL" ? "por semana" : "por día"} ·{" "}
                      <input
                        type="number"
                        step="0.5"
                        min="1"
                        max="7"
                        disabled={paid}
                        className="w-12 bg-transparent border border-border rounded px-1 text-xs text-right tabular-nums disabled:opacity-60"
                        value={draft[l.employeeId]?.daysPerWeek ?? String(l.daysPerWeek)}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [l.employeeId]: { ...d[l.employeeId], daysPerWeek: e.target.value },
                          }))
                        }
                        onBlur={(e) => {
                          const value = Number(e.target.value);
                          if (Number.isFinite(value) && value !== l.daysPerWeek) {
                            saveEmployee(l.employeeId, { daysPerWeek: value });
                          }
                        }}
                      />{" "}
                      días
                    </span>
                  )}
                  {l.payMode === "POR_PIEZA" && (
                    <span className="block text-xs text-muted mt-1">por pieza</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-center">
                    {days.map((d) => {
                      const absent = l.absenceDates.includes(d.iso);
                      return (
                        <button
                          key={d.iso}
                          onClick={() => toggleAbsence(l.employeeId, d.iso)}
                          disabled={paid}
                          title={absent ? "No trabajó — clic para desmarcar" : "Trabajó — clic para marcar ausencia"}
                          className={`w-8 h-9 rounded text-xs leading-tight transition disabled:opacity-60 ${
                            absent
                              ? "bg-critical-bg text-critical border border-critical/40"
                              : "bg-surface-2 text-muted hover:bg-surface-2/70"
                          }`}
                        >
                          <span className="block">{d.label.slice(0, 2)}</span>
                          <span className="block font-mono">{d.dayNumber}</span>
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {l.payMode === "POR_PIEZA" ? l.piecesDelivered : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {l.absenceDeduct > 0 ? (
                    <span className="text-critical">−{money(l.absenceDeduct, l.currency)}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold">
                  {money(l.total, l.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-4 py-3" colSpan={6}>
                Total a pagar esta semana
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-lg">{money(total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-muted">
        Los montos arrancan en cero: carga lo que cobra cada persona y queda guardado para todas las
        semanas siguientes. Las piezas entregadas se cuentan solas desde el pipeline, para quien cobre
        por pieza.
      </p>
    </div>
  );
}
