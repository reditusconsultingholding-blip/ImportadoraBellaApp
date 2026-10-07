"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { diaDeCobro } from "@/lib/pagos-recurrentes";

/**
 * Las apps que se pagan todos los meses.
 *
 * La tabla se ordena por cuánto falta para el próximo cobro, no por nombre ni
 * por fecha de alta: la pregunta que se viene a hacer acá es "¿qué se paga
 * ahora?", y responderla no debería costar leer catorce filas.
 */

export type Pago = {
  id: string;
  nombre: string;
  monto: number | null;
  moneda: string;
  diaDelMes: number;
  avisarDiasAntes: number;
  activo: boolean;
  notas: string | null;
};

const plata = (n: number, moneda: string) =>
  n.toLocaleString("es-EC", { style: "currency", currency: moneda || "USD" });

/** Cuántos días faltan para el próximo cobro, saltando al mes que viene. */
function faltanDias(diaDelMes: number, hoy: Date) {
  const anio = hoy.getUTCFullYear();
  const mes = hoy.getUTCMonth() + 1;
  const esteMes = diaDeCobro(anio, mes, diaDelMes);
  if (esteMes >= hoy.getUTCDate()) return esteMes - hoy.getUTCDate();
  // Ya pasó: el próximo es el del mes siguiente.
  const sig = new Date(Date.UTC(anio, mes, 1));
  const diaSig = diaDeCobro(sig.getUTCFullYear(), sig.getUTCMonth() + 1, diaDelMes);
  const ultimoDeEste = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return ultimoDeEste - hoy.getUTCDate() + diaSig;
}

function cuandoSeLee(dias: number) {
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  return `en ${dias} días`;
}

export default function ListaPagos({ inicial, hoyISO }: { inicial: Pago[]; hoyISO: string }) {
  const router = useRouter();
  const hoy = new Date(`${hoyISO}T00:00:00Z`);
  const [pagos, setPagos] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", monto: "", diaDelMes: "", avisarDiasAntes: "3" });

  const ordenados = [...pagos].sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    return faltanDias(a.diaDelMes, hoy) - faltanDias(b.diaDelMes, hoy);
  });

  const activos = pagos.filter((p) => p.activo);
  const totalMes = activos.reduce((s, p) => s + (p.monto ?? 0), 0);
  const sinMonto = activos.filter((p) => p.monto == null).length;

  async function pedir(cuerpo: Record<string, unknown>, metodo: "POST" | "DELETE" = "POST") {
    setGuardando(true);
    setError(null);
    try {
      const url = metodo === "DELETE" ? `/api/pagos?id=${cuerpo.id}` : "/api/pagos";
      const res = await fetch(url, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        ...(metodo === "POST" ? { body: JSON.stringify(cuerpo) } : {}),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      router.refresh();
      return j;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setGuardando(false);
    }
  }

  async function agregar() {
    const dia = Number(nuevo.diaDelMes);
    if (!nuevo.nombre.trim() || !dia) {
      setError("Falta el nombre o el día de cobro.");
      return;
    }
    const j = await pedir({
      nombre: nuevo.nombre,
      monto: nuevo.monto ? Number(nuevo.monto) : null,
      diaDelMes: dia,
      avisarDiasAntes: Number(nuevo.avisarDiasAntes) || 0,
    });
    if (j?.pago) {
      setPagos((prev) => [...prev, j.pago]);
      setNuevo({ nombre: "", monto: "", diaDelMes: "", avisarDiasAntes: "3" });
    }
  }

  async function alternar(p: Pago) {
    const j = await pedir({ id: p.id, activo: !p.activo });
    if (j?.pago) setPagos((prev) => prev.map((x) => (x.id === p.id ? j.pago : x)));
  }

  async function borrar(p: Pago) {
    const j = await pedir({ id: p.id }, "DELETE");
    if (j?.ok) setPagos((prev) => prev.filter((x) => x.id !== p.id));
  }

  return (
    <div className="flex flex-col gap-4">
      {activos.length > 0 && (
        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm">
          <span className="text-muted">Al mes: </span>
          <span className="font-medium text-foreground">{plata(totalMes, "USD")}</span>
          <span className="text-muted">
            {" "}
            en {activos.length} app{activos.length === 1 ? "" : "s"}
            {/* Decir cuántas no tienen monto evita que el total se lea como
                "esto es todo lo que se paga" cuando no lo es. */}
            {sinMonto > 0 &&
              ` · ${sinMonto} sin monto cargado, así que el total es de menos`}
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-critical/50 bg-critical-bg/60 px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">App</th>
              <th className="px-4 py-2.5 text-right">Monto</th>
              <th className="px-4 py-2.5 text-center">Cobra el</th>
              <th className="px-4 py-2.5">Próximo</th>
              <th className="px-4 py-2.5 text-center">Avisa</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Todavía no hay apps cargadas. Agregá la primera abajo y te avisamos antes de cada
                  cobro.
                </td>
              </tr>
            )}
            {ordenados.map((p) => {
              const faltan = faltanDias(p.diaDelMes, hoy);
              return (
                <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-foreground">{p.nombre}</span>
                    {p.notas && <span className="block text-[11px] text-muted">{p.notas}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {p.monto != null ? plata(p.monto, p.moneda) : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{p.diaDelMes}</td>
                  <td className="px-4 py-2.5">
                    {p.activo ? (
                      <span className={faltan <= 3 ? "font-medium text-accent-strong" : "text-muted"}>
                        {cuandoSeLee(faltan)}
                      </span>
                    ) : (
                      <span className="text-muted">pausada</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center text-muted">
                    {p.avisarDiasAntes === 0 ? "el día" : `${p.avisarDiasAntes} días antes`}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => alternar(p)}
                      disabled={guardando}
                      className="mr-2 rounded border border-border px-2 py-1 text-xs transition hover:bg-surface-2 disabled:opacity-50"
                    >
                      {p.activo ? "Pausar" : "Reactivar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => borrar(p)}
                      disabled={guardando}
                      className="rounded border border-border px-2 py-1 text-xs text-critical transition hover:bg-critical-bg/40 disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <Campo etiqueta="App" ancho="w-48">
          <input
            value={nuevo.nombre}
            onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            placeholder="Releasit"
            className={entrada}
          />
        </Campo>
        <Campo etiqueta="Monto (USD)" ancho="w-28">
          <input
            value={nuevo.monto}
            onChange={(e) => setNuevo({ ...nuevo, monto: e.target.value })}
            inputMode="decimal"
            placeholder="29.99"
            className={entrada}
          />
        </Campo>
        <Campo etiqueta="Cobra el día" ancho="w-24">
          <input
            value={nuevo.diaDelMes}
            onChange={(e) => setNuevo({ ...nuevo, diaDelMes: e.target.value })}
            inputMode="numeric"
            placeholder="10"
            className={entrada}
          />
        </Campo>
        <Campo etiqueta="Avisar con" ancho="w-28">
          <input
            value={nuevo.avisarDiasAntes}
            onChange={(e) => setNuevo({ ...nuevo, avisarDiasAntes: e.target.value })}
            inputMode="numeric"
            className={entrada}
          />
        </Campo>
        <button
          type="button"
          onClick={agregar}
          disabled={guardando}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Agregar"}
        </button>
      </div>

      <p className="text-[11px] text-muted">
        El aviso llega a dirección por la campanita, al teléfono y por correo: una vez unos días
        antes y otra el mismo día. Una app que cobra el 31 se avisa el último día del mes en los
        meses que no lo tienen.
      </p>
    </div>
  );
}

const entrada =
  "w-full rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent";

function Campo({
  etiqueta,
  ancho,
  children,
}: {
  etiqueta: string;
  ancho: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${ancho}`}>
      <span className="text-[10px] uppercase tracking-[0.07em] text-muted">{etiqueta}</span>
      {children}
    </label>
  );
}
