"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ESTADOS_PROPUESTA, TIPOS_PROPUESTA, textoDeEstado, textoDeTipo } from "@/lib/propuestas";
import DialogoPropuesta from "../propuesta-dialogo";

export type FilaPropuesta = {
  id: string;
  tipo: string;
  texto: string;
  dictado: boolean;
  ruta: string | null;
  seccion: string | null;
  estado: string;
  respuesta: string | null;
  autor: string;
  respondio: string | null;
  respondidoEn: string | null;
  creada: string;
  mia: boolean;
};

const COLOR_TIPO: Record<string, string> = {
  MEJORA: "bg-accent/10 text-accent",
  DUDA: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  ERROR: "bg-red-500/10 text-red-700 dark:text-red-300",
};
const COLOR_ESTADO: Record<string, string> = {
  NUEVA: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  EN_CURSO: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  HECHA: "border-accent/40 bg-accent/10 text-accent",
  DESCARTADA: "border-zinc-400/40 bg-zinc-400/10 text-zinc-500",
};

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-EC", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Guayaquil" });

export default function ListaPropuestas({
  inicial,
  direccion,
  abrir,
  puedeJarvis,
}: {
  inicial: FilaPropuesta[];
  direccion: boolean;
  abrir: string | null;
  puedeJarvis: boolean;
}) {
  const pathname = usePathname();
  const [filas, setFilas] = useState(inicial);
  const [filtroEstado, setFiltroEstado] = useState<string>("ABIERTAS");
  const [filtroTipo, setFiltroTipo] = useState<string>("TODOS");
  const [nueva, setNueva] = useState(false);

  const visibles = useMemo(
    () =>
      filas.filter(
        (f) =>
          (filtroTipo === "TODOS" || f.tipo === filtroTipo) &&
          (filtroEstado === "TODAS" ||
            (filtroEstado === "ABIERTAS" ? f.estado === "NUEVA" || f.estado === "EN_CURSO" : f.estado === filtroEstado)),
      ),
    [filas, filtroEstado, filtroTipo],
  );
  const abiertas = filas.filter((f) => f.estado === "NUEVA" || f.estado === "EN_CURSO").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          aria-label="Filtrar por estado"
        >
          <option value="ABIERTAS">Abiertas ({abiertas})</option>
          <option value="TODAS">Todas ({filas.length})</option>
          {ESTADOS_PROPUESTA.map((e) => (
            <option key={e.id} value={e.id}>
              {e.texto}
            </option>
          ))}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground"
          aria-label="Filtrar por tipo"
        >
          <option value="TODOS">Mejoras, dudas y errores</option>
          {TIPOS_PROPUESTA.map((t) => (
            <option key={t.id} value={t.id}>
              {t.texto}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setNueva(true)}
          className="ml-auto rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          + Proponer o avisar algo
        </button>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
          {filas.length === 0
            ? "Todavía no hay nada. Desde cualquier pantalla, toca «Ayuda» y luego «Proponer una mejora o avisar algo»: lo dices con la voz y llega acá."
            : "Nada con este filtro."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibles.map((f) => (
            <Tarjeta
              key={f.id}
              f={f}
              direccion={direccion}
              abierta={abrir === f.id}
              onCambio={(n) => setFilas((xs) => xs.map((x) => (x.id === n.id ? n : x)))}
            />
          ))}
        </ul>
      )}

      {nueva && (
        <DialogoPropuesta
          seccion="Propuestas y dudas"
          ruta={pathname}
          puedeJarvis={puedeJarvis}
          onCerrar={() => {
            setNueva(false);
            // Lo nuevo se ve al recargar la lista del servidor.
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}

function Tarjeta({
  f,
  direccion,
  abierta,
  onCambio,
}: {
  f: FilaPropuesta;
  direccion: boolean;
  abierta: boolean;
  onCambio: (f: FilaPropuesta) => void;
}) {
  const [respuesta, setRespuesta] = useState(f.respuesta ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(cambios: { estado?: string; respuesta?: string }) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/propuestas/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; propuesta?: { estado: string; respuesta: string | null; respondidoEn: string | null } };
      if (!res.ok || !j.propuesta) throw new Error(j.error ?? "No se pudo guardar.");
      onCambio({ ...f, estado: j.propuesta.estado, respuesta: j.propuesta.respuesta, respondidoEn: j.propuesta.respondidoEn, respondio: "Tú" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li
      id={f.id}
      className={`rounded-xl border bg-surface p-4 ${abierta ? "border-accent ring-2 ring-accent/30" : "border-border"}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-semibold ${COLOR_TIPO[f.tipo] ?? ""}`}>{textoDeTipo(f.tipo)}</span>
        <span className={`rounded-full border px-2 py-0.5 ${COLOR_ESTADO[f.estado] ?? ""}`}>{textoDeEstado(f.estado)}</span>
        <span className="text-muted">
          {f.mia ? "Tú" : f.autor} · {fecha(f.creada)}
          {f.dictado ? " · 🎙 dictado" : ""}
        </span>
        {f.seccion && (
          <span className="text-muted">
            ·{" "}
            {f.ruta ? (
              <Link href={f.ruta} className="underline hover:text-foreground">
                {f.seccion}
              </Link>
            ) : (
              f.seccion
            )}
          </span>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{f.texto}</p>

      {direccion ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
          <textarea
            value={respuesta}
            onChange={(e) => setRespuesta(e.target.value)}
            rows={2}
            placeholder="Respuesta para quien lo mandó (le llega como notificación)"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-2">
            {ESTADOS_PROPUESTA.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={guardando}
                onClick={() => guardar({ estado: e.id, respuesta })}
                className={`rounded-full border px-3 py-1 text-xs transition disabled:opacity-50 ${
                  f.estado === e.id ? COLOR_ESTADO[e.id] : "border-border text-foreground hover:border-accent"
                }`}
              >
                {e.texto}
              </button>
            ))}
            <button
              type="button"
              disabled={guardando || respuesta.trim() === (f.respuesta ?? "")}
              onClick={() => guardar({ respuesta })}
              className="ml-auto rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Responder"}
            </button>
          </div>
          {f.respondio && f.respondidoEn && (
            <p className="text-[11px] text-muted">
              Última respuesta: {f.respondio}, {fecha(f.respondidoEn)}
            </p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        f.respuesta && (
          <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Respuesta{f.respondio ? ` de ${f.respondio}` : ""}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-foreground">{f.respuesta}</p>
          </div>
        )
      )}
    </li>
  );
}
