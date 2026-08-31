"use client";

import { useCallback, useEffect, useState } from "react";
import {
  claveDiaEc,
  claveMes,
  etiquetaDiaEc,
  etiquetaMes,
  mesActualEc,
  mesCorrido,
  rejillaDelMes,
  type EventoVista,
} from "@/lib/calendario-fechas";

// El calendario de eventos de la empresa.
//
// Dos vistas de lo mismo, a propósito: la rejilla del mes para ubicarse —"el
// cierre cae jueves"— y la lista de lo que viene, que es lo que uno mira de
// verdad. Sin la lista, saber si hay algo mañana obliga a buscar el día de
// mañana en la grilla; sin la grilla, no se ve que hay tres cosas la misma
// semana.
//
// Ninguna cuenta de fechas se hace acá. El servidor manda cada evento con su
// día ("2026-09-01") y su hora ("14:30") YA resueltos a hora de Ecuador, y el
// formulario le manda esas mismas dos cadenas tal como las escribió la persona.
// Si este archivo convirtiera a instantes con `new Date`, usaría la zona del
// equipo de quien mira y el mismo evento quedaría en días distintos según desde
// dónde se cargue.

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type Datos = { eventos: EventoVista[]; proximos: EventoVista[] };

const VACIO: Datos = { eventos: [], proximos: [] };

export default function CalendarioPanel() {
  const [{ anio, mes }, setMes] = useState(mesActualEc);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const hoy = claveDiaEc(new Date());
  const [form, setForm] = useState({
    titulo: "",
    dia: hoy,
    todoElDia: true,
    hora: "09:00",
    horaFin: "",
    lugar: "",
    descripcion: "",
  });

  const cargar = useCallback((a: number, m: number) => {
    fetch(`/api/chat/calendario?mes=${claveMes(a, m)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Datos | null) => {
        setDatos(data ?? VACIO);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, []);

  useEffect(() => {
    cargar(anio, mes);
  }, [cargar, anio, mes]);

  // Los eventos del mes, agrupados por su día ecuatoriano. Se arma una vez por
  // render y no se busca dentro de la lista en cada casilla: son 42 casillas.
  const porDia = new Map<string, EventoVista[]>();
  for (const e of datos.eventos) {
    const lista = porDia.get(e.dia) ?? [];
    lista.push(e);
    porDia.set(e.dia, lista);
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo,
          dia: form.dia,
          todoElDia: form.todoElDia,
          hora: form.todoElDia ? undefined : form.hora,
          horaFin: form.todoElDia || !form.horaFin ? undefined : form.horaFin,
          lugar: form.lugar,
          descripcion: form.descripcion,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el evento.");
        return;
      }
      // Se salta al mes del evento recién creado: crear algo de octubre estando
      // en septiembre y que la pantalla no cambie se lee como que no se guardó.
      const [a, m] = form.dia.split("-").map(Number);
      setForm((f) => ({ ...f, titulo: "", lugar: "", descripcion: "" }));
      setAbierto(false);
      if (a !== anio || m !== mes) setMes({ anio: a, mes: m });
      else cargar(anio, mes);
    } catch {
      setError("No se pudo crear el evento. Revisa la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  async function borrar(evento: EventoVista) {
    if (!confirm(`¿Borrar "${evento.titulo}"?`)) return;
    try {
      const res = await fetch(`/api/chat/calendario?id=${encodeURIComponent(evento.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "No se pudo borrar el evento.");
        return;
      }
      cargar(anio, mes);
    } catch {
      setError("No se pudo borrar el evento. Revisa la conexión.");
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMes(mesCorrido(anio, mes, -1))}
            title="Mes anterior"
            className="rounded border border-border px-2 py-1 text-xs text-muted transition hover:text-foreground"
          >
            ‹
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-medium">
            {etiquetaMes(anio, mes)}
          </span>
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

        <button
          onClick={() => setAbierto((v) => !v)}
          className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
        >
          {abierto ? "Cancelar" : "Nuevo evento"}
        </button>
      </div>

      {abierto && (
        <form
          onSubmit={crear}
          className="flex flex-col gap-2 rounded border border-border bg-surface-2/50 p-3"
        >
          <input
            autoFocus
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            maxLength={140}
            placeholder="Nombre del evento"
            className="w-full rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={form.dia}
              onChange={(e) => setForm({ ...form, dia: e.target.value })}
              className="rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={form.todoElDia}
                onChange={(e) => setForm({ ...form, todoElDia: e.target.checked })}
              />
              Todo el día
            </label>
            {!form.todoElDia && (
              <>
                <input
                  type="time"
                  value={form.hora}
                  onChange={(e) => setForm({ ...form, hora: e.target.value })}
                  className="rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
                <span className="text-xs text-muted">a</span>
                <input
                  type="time"
                  value={form.horaFin}
                  onChange={(e) => setForm({ ...form, horaFin: e.target.value })}
                  className="rounded border border-border bg-transparent px-2 py-1.5 text-sm outline-none focus:border-accent"
                />
              </>
            )}
          </div>

          <input
            value={form.lugar}
            onChange={(e) => setForm({ ...form, lugar: e.target.value })}
            maxLength={120}
            placeholder="Dónde (opcional)"
            className="w-full rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <textarea
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            rows={2}
            placeholder="Detalle (opcional)"
            className="w-full resize-y rounded border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />

          <div className="flex items-center justify-between gap-2">
            {/* La hora es la de Ecuador y se dice, no se supone: alguien
                cargando un evento desde otro país tiene que saber contra qué
                reloj lo está poniendo. */}
            <span className="text-[11px] text-muted">Las horas son de Ecuador (UTC-5).</span>
            <button
              type="submit"
              disabled={enviando}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
            >
              {enviando ? "Guardando…" : "Crear evento"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="rounded border border-critical/30 bg-critical-bg px-3 py-2 text-sm text-critical">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_15rem]">
        <div>
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
                const esHoy = casilla.dia === hoy;
                return (
                  <div
                    key={casilla.dia}
                    className={`min-h-[4.5rem] p-1 ${
                      casilla.delMes ? "bg-surface" : "bg-surface-2/60"
                    }`}
                  >
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

                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {eventos.map((e) => (
                        <span
                          key={e.id}
                          title={`${e.hora ? `${e.hora} · ` : ""}${e.titulo}${
                            e.lugar ? ` · ${e.lugar}` : ""
                          }`}
                          className="truncate rounded bg-accent/15 px-1 py-0.5 text-[10px] leading-tight text-accent-strong"
                        >
                          {e.hora ? `${e.hora} ` : ""}
                          {e.titulo}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <aside>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-muted">
            Lo que viene
          </p>
          {cargando ? (
            <p className="text-xs text-muted">Cargando…</p>
          ) : datos.proximos.length === 0 ? (
            <p className="text-xs text-muted">No hay eventos programados.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {datos.proximos.map((e) => (
                <li key={e.id} className="rounded border border-border bg-surface px-2.5 py-2">
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-xs font-medium">{e.titulo}</p>
                    {e.puedeBorrar && (
                      <button
                        onClick={() => borrar(e)}
                        title="Borrar evento"
                        className="shrink-0 px-1 text-[11px] text-muted transition hover:text-critical"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {etiquetaDiaEc(e.dia)}
                    {e.hora && ` · ${e.hora}`}
                    {e.horaFin && ` a ${e.horaFin}`}
                  </p>
                  {e.lugar && <p className="text-[11px] text-muted">📍 {e.lugar}</p>}
                  {e.descripcion && (
                    <p className="mt-1 whitespace-pre-wrap text-[11px] text-muted">
                      {e.descripcion}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
