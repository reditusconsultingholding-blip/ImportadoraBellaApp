"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ESTADO_TAREA_LABEL, type EstadoTarea } from "@/lib/contenido-opciones";

// Todo lo que hay que hacer un día, al tocar su fecha en el calendario.
//
// El calendario muestra hasta seis etiquetas por casilla y después un "+4
// más": para ver el resto había que irse al tablero y buscar el día. Acá se
// abre el día entero sin salir del calendario — las tareas con su responsable
// y su estado, las actividades agendadas y los lotes que se entregan.

type Tarea = {
  id: string;
  estado: string;
  productoTexto: string | null;
  plataforma: string | null;
  numeroCreativos: number;
  notas: string | null;
  responsableTexto: string | null;
  owner: { id: string; name: string } | null;
  product: { id: string; code: string; name: string } | null;
  lote: { id: string; numero: number; nomenclatura: string | null } | null;
};

type Actividad = { id: string; titulo: string; hora: string | null; quien: string };
type Evento = { id: string; titulo: string; subtitulo: string | null; href: string };

const TONO: Record<string, string> = {
  PENDIENTE: "bg-surface-2 text-muted",
  EN_PROGRESO: "bg-pending-bg text-warning",
  HECHO: "bg-good-bg text-good",
  NO_CUMPLIDO: "bg-critical-bg text-critical",
  POR_PAUTAR: "bg-good-bg text-accent-strong",
};

function titulo(dia: string) {
  const t = new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-EC", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export default function DiaDetalle({
  dia,
  actividades,
  eventos,
  onCerrar,
}: {
  dia: string;
  actividades: Actividad[];
  eventos: Evento[];
  onCerrar: () => void;
}) {
  const [tareas, setTareas] = useState<Tarea[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/contenido/tareas?desde=${dia}&hasta=${dia}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No se pudo cargar el día."))))
      .then((j) => vivo && setTareas(j.tareas as Tarea[]))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudo cargar el día."));
    return () => {
      vivo = false;
    };
  }, [dia]);

  // Escape cierra, como en cualquier ventana. El foco arranca en el botón de
  // cerrar para que se pueda salir sin tocar el mouse.
  useEffect(() => {
    cerrarRef.current?.focus();
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  const pendientes = tareas?.filter((t) => t.estado !== "HECHO").length ?? 0;

  // Agrupadas por responsable: la pregunta al abrir un día es "quién tiene
  // qué", no "qué hay suelto".
  const porPersona = new Map<string, Tarea[]>();
  for (const t of tareas ?? []) {
    const quien = t.owner?.name ?? t.responsableTexto ?? "Sin responsable";
    porPersona.set(quien, [...(porPersona.get(quien) ?? []), t]);
  }
  const grupos = [...porPersona.entries()].sort((a, b) => {
    if (a[0] === "Sin responsable") return -1;
    if (b[0] === "Sin responsable") return 1;
    return b[1].length - a[1].length;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Deberes del ${titulo(dia)}`}
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-pop"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{titulo(dia)}</h2>
            <p className="text-xs text-muted">
              {tareas === null
                ? "Cargando…"
                : `${tareas.length} ${tareas.length === 1 ? "tarea" : "tareas"}${
                    pendientes > 0 ? ` · ${pendientes} sin cerrar` : " · todo cerrado"
                  }`}
            </p>
          </div>
          <button
            ref={cerrarRef}
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded px-2 py-1 text-lg leading-none text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            ×
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-3">
          {error && <p className="text-sm text-critical">{error}</p>}

          {eventos.length > 0 && (
            <section className="mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Lotes que se entregan</h3>
              <ul className="mt-1.5 flex flex-col gap-1">
                {eventos.map((e) => (
                  <li key={e.id}>
                    <Link href={e.href} className="text-sm text-accent-strong hover:underline">
                      {e.titulo}
                      {e.subtitulo && <span className="text-muted"> · {e.subtitulo}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {actividades.length > 0 && (
            <section className="mb-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">Actividades agendadas</h3>
              <ul className="mt-1.5 flex flex-col gap-1">
                {actividades.map((a) => (
                  <li key={a.id} className="text-sm text-foreground">
                    {a.hora && <span className="font-medium tabular-nums">{a.hora} </span>}
                    {a.titulo}
                    <span className="text-muted"> · {a.quien}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {tareas !== null && tareas.length === 0 && !error && (
            <p className="py-4 text-sm text-muted">Nadie tiene tareas cargadas para este día.</p>
          )}

          {grupos.map(([quien, suyas]) => (
            <section key={quien} className="mb-4 last:mb-0">
              <h3 className="flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
                {quien}
                <span className="font-normal normal-case">
                  {suyas.filter((t) => t.estado === "HECHO").length} de {suyas.length} cerradas
                </span>
              </h3>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {suyas.map((t) => (
                  <li key={t.id} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        TONO[t.estado] ?? TONO.PENDIENTE
                      }`}
                    >
                      {ESTADO_TAREA_LABEL[t.estado as EstadoTarea] ?? t.estado}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span className="text-foreground">
                        {t.product ? `${t.product.code} · ${t.product.name}` : (t.productoTexto ?? "Sin producto")}
                      </span>
                      <span className="block text-xs text-muted">
                        {[
                          t.numeroCreativos > 0 ? `${t.numeroCreativos} creativos` : null,
                          t.plataforma,
                          t.lote ? `lote ${t.lote.nomenclatura ?? t.lote.numero}` : null,
                          t.notas,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="border-t border-border px-5 py-2.5 text-right">
          <Link
            href={`/dashboard/contenido?vista=tablero#${dia}`}
            className="text-xs font-medium text-accent-strong hover:underline"
          >
            Abrir este día en el tablero →
          </Link>
        </footer>
      </div>
    </div>
  );
}
