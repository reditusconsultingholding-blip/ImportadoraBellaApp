"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  claveDiaEc,
  claveMes,
  etiquetaMes,
  mesActualEc,
  mesCorrido,
  rejillaDelMes,
} from "@/lib/calendario-fechas";
import { ESTADO_LOTE_LABEL, type EstadoLote } from "@/lib/contenido-opciones";
import DiaDetalle from "./dia-detalle";

// El calendario de contenido: cuándo tiene que estar listo cada lote. A
// diferencia del calendario de eventos de la empresa, acá los días son
// marcas simples (Ronda.fechaEntrega no lleva hora), así que no hace falta
// convertir nada a instante — el día que trae el servidor es el día tal cual.

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type Evento = {
  id: string;
  dia: string;
  titulo: string;
  subtitulo: string | null;
  estado: string;
  href: string;
};

type Etiqueta = { id: string; texto: string; estado: string; tareas: number; hechas: number; detalle: string };
type Actividad = { id: string; titulo: string; hora: string | null; quien: string };
type Datos = {
  eventos: Evento[];
  tareasPorDia: Record<string, number>;
  etiquetasPorDia: Record<string, Etiqueta[]>;
  actividadesPorDia: Record<string, Actividad[]>;
};
const VACIO: Datos = { eventos: [], tareasPorDia: {}, etiquetasPorDia: {}, actividadesPorDia: {} };

// El mismo color que en el tablero: así el estado se ve sin tener que leerlo,
// y las dos pantallas no parecen hablar de cosas distintas.
const TONO_ETIQUETA: Record<string, string> = {
  PENDIENTE: "bg-surface-2 text-muted",
  EN_PROGRESO: "bg-pending-bg text-warning",
  HECHO: "bg-good-bg text-good",
  NO_CUMPLIDO: "bg-critical-bg text-critical",
  POR_PAUTAR: "bg-good-bg text-accent-strong",
};

export default function CalendarioContenido() {
  const [{ anio, mes }, setMes] = useState(mesActualEc);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [cargando, setCargando] = useState(true);
  // Agendar una actividad en un día: se abre en la casilla misma, sin modal.
  const [agendando, setAgendando] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  // El día abierto en la ventana de detalle: al tocar la fecha se ven TODOS
  // los deberes de ese día, no las seis etiquetas que entran en la casilla.
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  async function agendar(dia: string, titulo: string, hora: string) {
    setErrorAlta(null);
    try {
      const res = await fetch("/api/chat/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim(), dia, hora: hora || undefined, todoElDia: !hora }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      setAgendando(null);
      setRecarga((n) => n + 1);
    } catch (e) {
      setErrorAlta(e instanceof Error ? e.message : String(e));
    }
  }

  const hoy = claveDiaEc(new Date());

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/contenido/calendario?mes=${claveMes(anio, mes)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Datos | null) => {
        if (cancelado) return;
        setDatos(data ?? VACIO);
        setCargando(false);
      })
      .catch(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [anio, mes, recarga]);

  const porDia = new Map<string, Evento[]>();
  for (const e of datos.eventos) {
    const lista = porDia.get(e.dia) ?? [];
    lista.push(e);
    porDia.set(e.dia, lista);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMes(mesCorrido(anio, mes, -1))}
            title="Mes anterior"
            className="rounded border border-border px-2 py-1 text-xs text-muted transition hover:text-foreground"
          >
            ‹
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-medium">{etiquetaMes(anio, mes)}</span>
          <button
            onClick={() => setMes(mesCorrido(anio, mes, 1))}
            title="Mes siguiente"
            className="rounded border border-border px-2 py-1 text-xs text-muted transition hover:text-foreground"
          >
            ›
          </button>
          <button
            onClick={() => setMes(mesActualEc())}
            className="ml-1 rounded px-2 py-1 text-xs text-muted transition hover:text-foreground"
          >
            Hoy
          </button>
        </div>
        <p className="text-xs text-muted">
          Cada etiqueta es una persona con su carga del día. Tócala —o toca la{" "}
          <span className="font-medium text-foreground">fecha</span>— para ver qué tiene que entregar, o el{" "}
          <span className="font-medium text-foreground">+</span> para agendar una actividad. Los lotes se crean desde la
          ficha de cada producto.
        </p>
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[10px] font-semibold uppercase tracking-[0.06em] text-muted">
        {DIAS_SEMANA.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded border border-border bg-border">
        {rejillaDelMes(anio, mes)
          .flat()
          .map((casilla) => {
            const eventos = porDia.get(casilla.dia) ?? [];
            const tareas = datos.tareasPorDia[casilla.dia] ?? 0;
            const esHoy = casilla.dia === hoy;
            return (
              <div
                key={casilla.dia}
                className={`group relative min-h-[8rem] p-1 ${casilla.delMes ? "bg-surface" : "bg-surface-2/60"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => setDiaAbierto(casilla.dia)}
                    title="Ver todos los deberes de este día"
                    className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] transition hover:ring-2 hover:ring-accent/40 ${
                      esHoy
                        ? "bg-accent font-semibold text-white"
                        : casilla.delMes
                          ? "text-foreground hover:bg-surface-2"
                          : "text-muted/60 hover:bg-surface-2"
                    }`}
                  >
                    {Number(casilla.dia.slice(8))}
                  </button>
                  <span className="flex items-center gap-1">
                    {tareas > 0 && (
                      <span className="text-[9px] text-muted" title={`${tareas} tareas ese día`}>
                        {tareas} tarea{tareas === 1 ? "" : "s"}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setErrorAlta(null);
                        setAgendando(agendando === casilla.dia ? null : casilla.dia);
                      }}
                      title="Agendar una actividad este día"
                      className="grid h-4 w-4 place-items-center rounded text-[12px] leading-none text-muted opacity-0 transition hover:bg-surface-2 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                    >
                      +
                    </button>
                  </span>
                </div>
                {agendando === casilla.dia && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      agendar(casilla.dia, String(f.get("titulo") ?? ""), String(f.get("hora") ?? ""));
                    }}
                    className="absolute left-1 right-1 top-6 z-20 flex flex-col gap-1 rounded-lg border border-border bg-surface p-1.5 shadow-lg"
                  >
                    <input
                      name="titulo"
                      autoFocus
                      placeholder="¿Qué actividad?"
                      onKeyDown={(e) => e.key === "Escape" && setAgendando(null)}
                      className="w-full rounded border border-border px-1.5 py-1 text-[11px] outline-none focus:border-accent"
                    />
                    <div className="flex items-center gap-1">
                      <input name="hora" type="time" className="min-w-0 flex-1 rounded border border-border px-1 py-0.5 text-[10px]" />
                      <button type="submit" className="rounded bg-accent px-2 py-0.5 text-[10px] font-medium text-white">
                        Agendar
                      </button>
                    </div>
                    {errorAlta && <p className="text-[10px] text-critical">{errorAlta}</p>}
                  </form>
                )}
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {/* Las actividades de la gente van primero y con su propio
                      color: son lo que alguien agendó a una hora, no una pieza
                      de contenido. */}
                  {(datos.actividadesPorDia[casilla.dia] ?? []).map((a) => (
                    <span
                      key={a.id}
                      title={`${a.hora ? `${a.hora} · ` : ""}${a.titulo} · ${a.quien}`}
                      className="block truncate rounded bg-[#EEF1FB] px-1 py-0.5 text-[10px] leading-tight text-[#3A4FA3]"
                    >
                      {a.hora && <span className="font-medium">{a.hora} </span>}
                      {a.titulo}
                      <span className="opacity-60"> · {a.quien}</span>
                    </span>
                  ))}
                  {/* Quién trabaja ese día, una etiqueta por persona con su
                      carga y su estado. Antes había una etiqueta por tarea con
                      el nombre del producto: un día con treinta piezas
                      mostraba seis productos sueltos y "+24 más", que no deja
                      ver ni quién está cargado ni cómo viene el día. */}
                  {(datos.etiquetasPorDia[casilla.dia] ?? []).slice(0, 5).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDiaAbierto(casilla.dia)}
                      title={`${t.texto}: ${t.hechas} de ${t.tareas} cerradas · ${t.detalle}`}
                      className={`flex w-full items-center justify-between gap-1 truncate rounded px-1 py-0.5 text-[10px] leading-tight transition hover:opacity-80 ${
                        TONO_ETIQUETA[t.estado] ?? TONO_ETIQUETA.PENDIENTE
                      }`}
                    >
                      <span className="truncate">{t.texto}</span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {t.hechas}/{t.tareas}
                      </span>
                    </button>
                  ))}
                  {(datos.etiquetasPorDia[casilla.dia]?.length ?? 0) > 5 && (
                    <button
                      type="button"
                      onClick={() => setDiaAbierto(casilla.dia)}
                      className="px-1 text-left text-[9px] text-muted hover:text-foreground hover:underline"
                    >
                      +{(datos.etiquetasPorDia[casilla.dia]?.length ?? 0) - 5} personas más
                    </button>
                  )}

                  {eventos.map((e) => (
                    <Link
                      key={e.id}
                      href={e.href}
                      title={`${e.titulo}${e.subtitulo ? ` · ${e.subtitulo}` : ""} · ${
                        ESTADO_LOTE_LABEL[e.estado as EstadoLote] ?? e.estado
                      }`}
                      className="block truncate rounded bg-accent/15 px-1 py-0.5 text-[10px] leading-tight text-accent-strong hover:bg-accent/25"
                    >
                      {e.titulo}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
      </div>

      {diaAbierto && (
        <DiaDetalle
          dia={diaAbierto}
          actividades={datos.actividadesPorDia[diaAbierto] ?? []}
          eventos={(porDia.get(diaAbierto) ?? []).map((e) => ({
            id: e.id,
            titulo: e.titulo,
            subtitulo: e.subtitulo,
            href: e.href,
          }))}
          onCerrar={() => setDiaAbierto(null)}
        />
      )}

      {cargando && <p className="text-xs text-muted">Cargando…</p>}
      {!cargando && datos.eventos.length === 0 && (
        <p className="text-xs text-muted">Ningún lote con fecha de entrega este mes.</p>
      )}
    </div>
  );
}
