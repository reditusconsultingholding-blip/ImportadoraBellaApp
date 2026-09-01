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

type Datos = { eventos: Evento[]; tareasPorDia: Record<string, number> };
const VACIO: Datos = { eventos: [], tareasPorDia: {} };

export default function CalendarioContenido() {
  const [{ anio, mes }, setMes] = useState(mesActualEc);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [cargando, setCargando] = useState(true);

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
  }, [anio, mes]);

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
        <p className="text-xs text-muted">Los lotes se crean desde la ficha de cada producto.</p>
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
                className={`min-h-[5.5rem] p-1 ${casilla.delMes ? "bg-surface" : "bg-surface-2/60"}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] ${
                      esHoy
                        ? "bg-accent font-semibold text-white"
                        : casilla.delMes
                          ? "text-foreground"
                          : "text-muted/60"
                    }`}
                  >
                    {Number(casilla.dia.slice(8))}
                  </span>
                  {tareas > 0 && (
                    <span className="text-[9px] text-muted" title={`${tareas} tareas ese día`}>
                      {tareas} tarea{tareas === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5">
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

      {cargando && <p className="text-xs text-muted">Cargando…</p>}
      {!cargando && datos.eventos.length === 0 && (
        <p className="text-xs text-muted">Ningún lote con fecha de entrega este mes.</p>
      )}
    </div>
  );
}
