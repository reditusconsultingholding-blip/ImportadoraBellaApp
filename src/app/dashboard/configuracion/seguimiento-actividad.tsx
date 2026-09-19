"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { describirActividad, describirNavegador, type EventoActividad } from "@/lib/actividad-texto";

type Persona = { id: string; name: string; email: string; role: string };

const ZONA = "America/Guayaquil";
const diaDe = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date(iso));
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-EC", { timeZone: ZONA, hour: "2-digit", minute: "2-digit" });
const tituloDia = (dia: string) => {
  const t = new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-EC", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const FILTROS: { id: string; texto: string }[] = [
  { id: "", texto: "Todo" },
  { id: "vista", texto: "Pantallas" },
  { id: "accion", texto: "Acciones" },
  { id: "busqueda", texto: "Búsquedas" },
  { id: "descarga", texto: "Descargas" },
  { id: "jarvis", texto: "Jarvis" },
  { id: "entrada", texto: "Entradas" },
  { id: "login_fallido", texto: "Intentos fallidos" },
];

// Color por tipo: lo que más conviene mirar (descargas, intentos fallidos,
// acciones) resalta; las pantallas vistas quedan neutras.
const MARCA: Record<string, string> = {
  vista: "bg-border-strong",
  accion: "bg-accent",
  busqueda: "bg-brand-green",
  descarga: "bg-warning",
  jarvis: "bg-brand-navy",
  entrada: "bg-good",
  salida: "bg-muted",
  login_fallido: "bg-critical",
};

export default function SeguimientoActividad({ personas, hoy }: { personas: Persona[]; hoy: string }) {
  const hace7 = useMemo(() => {
    const d = new Date(`${hoy}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 6);
    return d.toISOString().slice(0, 10);
  }, [hoy]);

  const [usuario, setUsuario] = useState("");
  const [desde, setDesde] = useState(hace7);
  const [hasta, setHasta] = useState(hoy);
  const [tipo, setTipo] = useState("");
  const [resultado, setResultado] = useState<{
    clave: string;
    eventos: EventoActividad[];
    truncado: boolean;
    error: string | null;
  } | null>(null);

  // La consulta en curso se identifica por su clave: "cargando" es que lo que
  // hay en pantalla todavía no corresponde a lo que se pidió.
  const clave = usuario ? new URLSearchParams({ usuario, desde, hasta, ...(tipo ? { tipo } : {}) }).toString() : null;

  const pedir = useCallback(async (qs: string) => {
    try {
      const r = await fetch(`/api/actividad?${qs}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "No se pudo cargar.");
      return { clave: qs, eventos: j.eventos as EventoActividad[], truncado: Boolean(j.truncado), error: null };
    } catch (err) {
      return { clave: qs, eventos: [], truncado: false, error: err instanceof Error ? err.message : "No se pudo cargar." };
    }
  }, []);

  useEffect(() => {
    if (!clave) return;
    let vigente = true;
    pedir(clave).then((r) => {
      if (vigente) setResultado(r);
    });
    return () => {
      vigente = false;
    };
  }, [clave, pedir]);

  const actual = resultado && resultado.clave === clave ? resultado : null;
  const cargando = Boolean(clave) && !actual;
  const eventos = useMemo(() => actual?.eventos ?? [], [actual]);
  const truncado = actual?.truncado ?? false;
  const error = actual?.error ?? null;

  const porDia = useMemo(() => {
    const m = new Map<string, EventoActividad[]>();
    for (const e of eventos) {
      const d = diaDe(e.momento);
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    return [...m.entries()];
  }, [eventos]);

  const claseCampo = "rounded border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground";

  return (
    <section className="rounded border border-border bg-surface p-5">
      <h2 className="text-base font-semibold text-foreground">Seguimiento de actividad</h2>
      <p className="mt-1 text-sm text-muted">
        Qué pantallas abrió cada persona, qué hizo, qué descargó, qué buscó y qué le preguntó a Jarvis. Solo lo ve el
        administrador. Se guarda 90 días.
      </p>
      <p className="mt-1 text-xs text-muted">
        Las acciones se registran en el momento en que se piden: si el sistema las rechazó (sin permiso o con datos
        inválidos) también aparecen, porque un intento también dice algo.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Persona
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className={`${claseCampo} min-w-[220px]`}>
            <option value="">Elegir…</option>
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Desde
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className={claseCampo} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Hasta
          <input type="date" value={hasta} min={desde} max={hoy} onChange={(e) => setHasta(e.target.value)} className={claseCampo} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setTipo(f.id)}
            className={`rounded-full border px-3 py-1 text-xs ${
              tipo === f.id ? "border-accent bg-accent text-white" : "border-border text-muted hover:text-foreground"
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      {!usuario && <p className="mt-6 text-sm text-muted">Elige una persona para ver su actividad.</p>}
      {error && <p className="mt-6 text-sm text-critical">{error}</p>}
      {usuario && cargando && <p className="mt-6 text-sm text-muted">Cargando…</p>}
      {usuario && !cargando && !error && eventos.length === 0 && (
        <p className="mt-6 text-sm text-muted">Sin actividad registrada en esas fechas.</p>
      )}
      {truncado && (
        <p className="mt-4 text-xs text-warning">Hay más de 3.000 registros: se muestran los más recientes. Acorta el rango.</p>
      )}

      <div className="mt-5 flex flex-col gap-6">
        {porDia.map(([dia, lista]) => {
          const pantallas = lista.filter((e) => e.tipo === "vista").length;
          const acciones = lista.filter((e) => e.tipo === "accion").length;
          const fallidos = lista.filter((e) => e.tipo === "login_fallido").length;
          return (
            <div key={dia}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-1.5">
                <h3 className="text-sm font-semibold text-foreground">{tituloDia(dia)}</h3>
                <p className="text-xs text-muted">
                  {hora(lista[lista.length - 1].momento)} a {hora(lista[0].momento)} · {pantallas} pantallas · {acciones} acciones
                  {fallidos > 0 && <span className="text-critical"> · {fallidos} intentos fallidos</span>}
                </p>
              </div>
              <ol className="mt-2 flex flex-col">
                {lista.map((e) => {
                  const d = describirActividad(e);
                  const equipo = [e.ip, describirNavegador(e.navegador)].filter(Boolean).join(" · ");
                  return (
                    <li key={e.id} className="flex gap-3 py-1.5 text-sm">
                      <span className="w-12 shrink-0 tabular-nums text-muted">{hora(e.momento)}</span>
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${MARCA[e.tipo] ?? "bg-muted"}`} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={e.tipo === "login_fallido" ? "text-critical" : "text-foreground"}>{d.titulo}</span>
                        {d.detalle && <span className="block break-words text-xs text-muted">{d.detalle}</span>}
                        {equipo && (e.tipo === "entrada" || e.tipo === "login_fallido" || e.tipo === "descarga") && (
                          <span className="block text-[11px] text-muted">{equipo}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
