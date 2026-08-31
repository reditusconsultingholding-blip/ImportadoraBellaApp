"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DESENLACES,
  fechaHoraEcuador,
  type Desenlace,
  type EntradaHistorial,
} from "@/lib/historial-formato";

// El historial de decisiones del producto.
//
// Antes una propuesta se aprobaba o se rechazaba y desaparecía de la cola: al
// mes siguiente nadie podía decir si "escalar este producto" ya se había pedido
// y dirección lo había negado, ni con qué argumento. Esta pantalla es esa
// memoria — quién pidió qué, cuándo, y qué se respondió.

type Filtro = "todas" | Desenlace;

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "PENDIENTE", label: "Pendientes" },
  { id: "ACEPTADA", label: "Aceptadas" },
  { id: "NEGADA", label: "Negadas" },
];

export type Persona = { id: string; name: string };

export default function HistorialDecisiones({
  entradas,
  equipo,
  puedeDecidir,
}: {
  entradas: EntradaHistorial[];
  equipo: Persona[];
  puedeDecidir: boolean;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conteos = useMemo(() => {
    const c: Record<Desenlace, number> = { PENDIENTE: 0, ACEPTADA: 0, NEGADA: 0 };
    for (const e of entradas) c[e.desenlace] += 1;
    return c;
  }, [entradas]);

  const visibles = useMemo(
    () => (filtro === "todas" ? entradas : entradas.filter((e) => e.desenlace === filtro)),
    [entradas, filtro]
  );

  function cerrarFormulario() {
    setResolviendo(null);
    setAssigneeId("");
    setDueDate("");
    setNota("");
    setError(null);
  }

  async function decidir(id: string, decision: "aprobar" | "rechazar") {
    setOcupado(true);
    setError(null);
    try {
      // La misma API que la cola de aprobación del panel: si esta pantalla
      // tuviera su propia ruta, aprobar desde aquí no crearía los creativos ni
      // avisaría a nadie, y las dos formas de decidir dejarían de significar lo
      // mismo.
      const res = await fetch("/api/acciones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          decision,
          assigneeId: assigneeId || undefined,
          dueDate: dueDate || undefined,
          nota: nota || undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "No se pudo guardar la decisión.");
      }
      cerrarFormulario();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la decisión.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="overflow-hidden rounded border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Historial de decisiones</h2>
          <p className="text-xs text-muted">
            Todo lo que se le propuso a dirección para este producto, y qué se respondió.
          </p>
        </div>
        <span className="ml-auto flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const cuantas = f.id === "todas" ? entradas.length : conteos[f.id];
            return (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  filtro === f.id
                    ? "border-accent bg-good-bg text-accent-strong"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
                }`}
              >
                {f.label} · {cuantas}
              </button>
            );
          })}
        </span>
      </div>

      {entradas.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">
          Todavía no hay propuestas registradas para este producto.
        </p>
      ) : visibles.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted">
          Ninguna propuesta de este producto quedó como{" "}
          {DESENLACES[filtro as Desenlace].palabra.toLowerCase()}.
        </p>
      ) : (
        // El historial crece para siempre: hace scroll dentro de su caja en vez
        // de estirar la ficha del producto hasta que el resto quede lejos.
        <div className="max-h-[34rem] overflow-y-auto">
          {visibles.map((e) => {
            const d = DESENLACES[e.desenlace];
            const abierto = resolviendo === e.id;

            return (
              <div key={e.id} className="border-b border-border px-5 py-3.5 last:border-b-0">
                <div className="flex flex-wrap items-start gap-2">
                  <span
                    title={d.ayuda}
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${d.chip}`}
                  >
                    {d.palabra}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted">
                    {e.tipo}
                  </span>
                  {e.origen === "JARVIS" && (
                    <span
                      title="Propuesta del asistente sobre la campaña"
                      className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted"
                    >
                      Jarvis
                    </span>
                  )}
                  <span className="ml-auto text-[11px] tabular-nums text-muted">
                    {fechaHoraEcuador(e.pedidaEl)}
                  </span>
                </div>

                <p className="mt-2 text-sm break-words">
                  {e.detalle}
                  {e.cantidad ? ` · ${e.cantidad} piezas` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted break-words">{e.motivo}</p>

                <p className="mt-1.5 text-xs text-muted break-words">
                  Lo pidió {e.pedidaPor}
                  {e.desenlace === "PENDIENTE" ? (
                    " · sin resolver todavía"
                  ) : (
                    <>
                      {" · "}
                      {d.palabra.toLowerCase()}
                      {e.resueltaPor ? ` por ${e.resueltaPor}` : " (no quedó registrado por quién)"}
                      {e.resueltaEl
                        ? ` el ${fechaHoraEcuador(e.resueltaEl)}`
                        : " (sin fecha de resolución registrada)"}
                      {e.matiz ? ` · ${e.matiz}` : ""}
                    </>
                  )}
                  {e.asignadaA ? ` · a cargo de ${e.asignadaA}` : ""}
                  {e.creativos
                    ? ` · ${e.creativos} ${e.creativos === 1 ? "creativo" : "creativos"} en el pipeline`
                    : ""}
                </p>

                {e.nota ? (
                  <p className="mt-2 border-l-2 border-border pl-2.5 text-xs break-words">
                    <span className="font-medium">Nota: </span>
                    {e.nota}
                  </p>
                ) : e.desenlace !== "PENDIENTE" ? (
                  // Se distingue "no escribió nota" de "no había dónde
                  // escribirla": lo segundo es un hueco del sistema, no del que
                  // decidió, y confundirlos hace culpar a la persona equivocada.
                  <p className="mt-2 text-xs text-muted">
                    {e.admiteNota
                      ? "Resuelta, sin nota registrada."
                      : "Este mecanismo no guarda la nota de quien decide."}
                  </p>
                ) : null}

                {e.desenlace === "PENDIENTE" && !e.resolubleAqui && (
                  <p className="mt-2 text-xs text-muted">
                    Se resuelve desde Jarvis: aprobarla también la aplica en la plataforma.
                  </p>
                )}

                {e.desenlace === "PENDIENTE" && e.resolubleAqui && puedeDecidir && !abierto && (
                  <button
                    onClick={() => {
                      cerrarFormulario();
                      setResolviendo(e.id);
                    }}
                    className="mt-2 rounded border border-border px-2.5 py-1 text-xs text-muted transition hover:border-border-strong hover:text-foreground"
                  >
                    Resolver
                  </button>
                )}

                {abierto && (
                  <div className="mt-2 flex flex-col gap-2 rounded border border-border bg-surface-2/40 px-3 py-3">
                    {e.tipo === "Creativos nuevos" && (
                      <div className="flex flex-wrap gap-2">
                        <label className="text-xs">
                          <span className="mb-1 block font-semibold uppercase tracking-[0.07em] text-muted">
                            Quién lo hace
                          </span>
                          <select
                            value={assigneeId}
                            onChange={(ev) => setAssigneeId(ev.target.value)}
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
                            onChange={(ev) => setDueDate(ev.target.value)}
                            className="rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
                          />
                        </label>
                      </div>
                    )}

                    <input
                      value={nota}
                      onChange={(ev) => setNota(ev.target.value)}
                      placeholder="Por qué se acepta o se niega (queda en el historial)"
                      className="rounded border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />

                    {error && <p className="text-xs text-critical">{error}</p>}

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => decidir(e.id, "aprobar")}
                        disabled={ocupado}
                        className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
                      >
                        Aceptar
                      </button>
                      <button
                        onClick={() => decidir(e.id, "rechazar")}
                        disabled={ocupado}
                        className="rounded border border-border px-3 py-1.5 text-xs text-muted transition hover:border-critical hover:text-critical disabled:opacity-40"
                      >
                        Negar
                      </button>
                      <button
                        onClick={cerrarFormulario}
                        disabled={ocupado}
                        className="rounded px-2 py-1.5 text-xs text-muted transition hover:text-foreground disabled:opacity-40"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
