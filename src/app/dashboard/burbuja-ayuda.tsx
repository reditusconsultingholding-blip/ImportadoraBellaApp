"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { PasoCapacitacion } from "@/lib/capacitacion-pasos";
import { buscarAyuda, pasosDeLaPantalla, type PreguntaFrecuente, type Resultado } from "@/lib/ayuda-busqueda";
import { PREGUNTAS } from "@/lib/ayuda-preguntas";
import { textoDelPaso } from "@/lib/voz-capacitacion";
import { huellaDeTexto } from "@/lib/huella-texto";

// LA BURBUJA DE AYUDA (Sebastian, 12-nov).
//
// La capacitación sale sola una sola vez. Después, lo que alguien no entendió
// lo pregunta acá, desde cualquier pantalla, sin salir de lo que estaba
// haciendo:
//
// - «En esta pantalla»: los pasos de la capacitación que explican justo la
//   pantalla abierta, con su video.
// - La caja de dudas: se escribe en palabras propias y responde con lo que ya
//   está escrito (preguntas frecuentes + capacitación). No gasta nada por
//   pregunta ni inventa funciones; si no encuentra, ofrece preguntarle a
//   Jarvis.
// - Cada respuesta trae «Ver el video» y «Llévame ahí».
//
// Los videos son grabaciones reales del panel con la voz de la capacitación a
// 1,25x (scripts/videos-capacitacion.ts). Igual que los audios, cada video
// queda atado a la huella del texto con el que se grabó: si el paso cambió y
// el video no se rehízo, no se ofrece, para no mostrar una pantalla vieja.

type EntradaVideo = { archivo: string; huella: string; segundos: number; poster?: string };
type ManifiestoVideos = Record<string, EntradaVideo>;

const CARPETA = "/video/capacitacion";

let manifiestoVideos: ManifiestoVideos | null = null;
let pedidoVideos: Promise<ManifiestoVideos> | null = null;
function cargarVideos(): Promise<ManifiestoVideos> {
  if (manifiestoVideos) return Promise.resolve(manifiestoVideos);
  pedidoVideos ??= fetch(`${CARPETA}/manifiesto.json`, { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<ManifiestoVideos>) : {}))
    .catch(() => ({}))
    .then((m) => (manifiestoVideos = m));
  return pedidoVideos;
}

function videoDelPaso(paso: PasoCapacitacion, m: ManifiestoVideos): EntradaVideo | null {
  const v = m[paso.id];
  if (!v) return null;
  return v.huella === huellaDeTexto(textoDelPaso(paso)) ? v : null;
}

const duracion = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function BurbujaAyuda({ pasos, puedeJarvis }: { pasos: PasoCapacitacion[]; puedeJarvis: boolean }) {
  const enElNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const router = useRouter();
  const pathname = usePathname();
  const vista = useSearchParams().get("vista");

  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [abiertaPregunta, setAbiertaPregunta] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [videos, setVideos] = useState<ManifiestoVideos>({});
  const [reproduciendo, setReproduciendo] = useState<PasoCapacitacion | null>(null);
  const entradaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    cargarVideos().then((m) => vivo && setVideos(m));
    entradaRef.current?.focus();
    return () => {
      vivo = false;
    };
  }, [abierta]);

  useEffect(() => {
    if (!abierta && !reproduciendo) return;
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (reproduciendo) setReproduciendo(null);
      else setAbierta(false);
    };
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
  }, [abierta, reproduciendo]);

  const porId = useMemo(() => new Map(pasos.map((p) => [p.id, p])), [pasos]);
  const deEstaPantalla = useMemo(() => pasosDeLaPantalla(pasos, pathname, vista), [pasos, pathname, vista]);
  const resultados: Resultado[] = useMemo(
    () => (consulta.trim().length >= 3 ? buscarAyuda(consulta, PREGUNTAS, pasos) : []),
    [consulta, pasos],
  );
  // Las preguntas de esta pantalla primero; si no hay, las generales.
  const preguntasSugeridas = useMemo(() => {
    const visibles = PREGUNTAS.filter((q) => porId.has(q.pasoId));
    const ids = new Set(deEstaPantalla.map((p) => p.id));
    const propias = visibles.filter((q) => ids.has(q.pasoId));
    return (propias.length ? propias : visibles).slice(0, 4);
  }, [porId, deEstaPantalla]);
  const conVideo = pasos.filter((p) => videoDelPaso(p, videos));

  if (!pasos.length) return null;

  function irA(paso: PasoCapacitacion) {
    setAbierta(false);
    router.push(paso.ruta);
  }

  function acciones(paso: PasoCapacitacion | null) {
    if (!paso) return null;
    const video = videoDelPaso(paso, videos);
    const yaEsta = paso.ruta.split("?")[0] === pathname && deEstaPantalla[0]?.id === paso.id;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {video && (
          <button
            type="button"
            onClick={() => setReproduciendo(paso)}
            className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white transition hover:bg-accent-strong"
          >
            <svg viewBox="0 0 16 16" width="11" height="11" fill="currentColor" aria-hidden="true">
              <path d="M4 2.5v11l9-5.5z" />
            </svg>
            Ver el video · {duracion(video.segundos)}
          </button>
        )}
        {!yaEsta && (
          <button
            type="button"
            onClick={() => irA(paso)}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground transition hover:border-accent"
          >
            Llévame ahí →
          </button>
        )}
      </div>
    );
  }

  function pregunta(q: PreguntaFrecuente) {
    const abiertaEsta = abiertaPregunta === q.id;
    return (
      <li key={q.id} className="border-t border-border first:border-t-0">
        <button
          type="button"
          onClick={() => setAbiertaPregunta(abiertaEsta ? null : q.id)}
          aria-expanded={abiertaEsta}
          className="flex w-full items-start justify-between gap-2 px-4 py-2.5 text-left text-sm text-foreground hover:bg-surface-2"
        >
          <span>{q.pregunta}</span>
          <span className="text-muted">{abiertaEsta ? "−" : "+"}</span>
        </button>
        {abiertaEsta && (
          <div className="px-4 pb-3 text-[13px] leading-relaxed text-muted">
            {q.respuesta}
            {acciones(porId.get(q.pasoId) ?? null)}
          </div>
        )}
      </li>
    );
  }

  const panel = (
    <div
      role="dialog"
      aria-label="Ayuda"
      className="fixed bottom-20 right-3 z-50 flex max-h-[min(640px,calc(100vh-110px))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)] sm:right-5"
    >
      <div className="flex items-center justify-between border-b border-border bg-brand-navy px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold">¿En qué te ayudo?</p>
          <p className="text-[11px] text-white/70">Pregunta lo que no entiendas y te muestro cómo se hace.</p>
        </div>
        <button
          type="button"
          onClick={() => setAbierta(false)}
          aria-label="Cerrar la ayuda"
          className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="border-b border-border p-3">
        <input
          ref={entradaRef}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Escribe tu duda: «cómo pongo testeo a un producto»"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {consulta.trim().length >= 3 ? (
          <div className="p-1">
            {resultados.length ? (
              <ul>
                {resultados.map((r) =>
                  r.tipo === "pregunta" ? (
                    <li key={`q-${r.pregunta.id}`} className="border-b border-border px-3 py-3 last:border-b-0">
                      <p className="text-sm font-semibold text-foreground">{r.pregunta.pregunta}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">{r.pregunta.respuesta}</p>
                      {acciones(r.paso ? (porId.get(r.paso.id) ?? null) : null)}
                    </li>
                  ) : (
                    <li key={`p-${r.paso.id}`} className="border-b border-border px-3 py-3 last:border-b-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted">{r.paso.seccion}</p>
                      <p className="text-sm font-semibold text-foreground">{r.paso.titulo}</p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted">{r.frase}</p>
                      {acciones(porId.get(r.paso.id) ?? null)}
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <div className="px-3 py-4 text-sm text-muted">
                No encontré eso en la capacitación.
                {puedeJarvis && (
                  <button
                    type="button"
                    onClick={() => {
                      setAbierta(false);
                      router.push(`/dashboard/jarvis?pregunta=${encodeURIComponent(consulta.trim())}`);
                    }}
                    className="mt-2 block rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-strong"
                  >
                    Preguntarle a Jarvis →
                  </button>
                )}
              </div>
            )}
          </div>
        ) : verTodos ? (
          <div>
            <button
              type="button"
              onClick={() => setVerTodos(false)}
              className="px-4 pt-3 text-xs text-muted hover:text-foreground"
            >
              ← Volver
            </button>
            <ul className="p-2">
              {conVideo.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setReproduciendo(p)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-good-bg text-accent">▶</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11px] uppercase tracking-wide text-muted">{p.seccion}</span>
                      <span className="block truncate text-sm text-foreground">{p.titulo}</span>
                    </span>
                    <span className="text-xs tabular-nums text-muted">{duracion(videoDelPaso(p, videos)!.segundos)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            {deEstaPantalla.length > 0 && (
              <section className="border-b border-border px-4 py-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">En esta pantalla</h3>
                <ul className="mt-2 flex flex-col gap-3">
                  {deEstaPantalla.map((p) => (
                    <li key={p.id}>
                      <p className="text-sm font-semibold text-foreground">{p.titulo}</p>
                      <p className="mt-0.5 line-clamp-3 text-[13px] leading-relaxed text-muted">{p.texto}</p>
                      {acciones(p)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h3 className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Preguntas frecuentes</h3>
              <ul className="mt-1">
                {preguntasSugeridas.map((q) => pregunta(q))}
              </ul>
            </section>
          </>
        )}
      </div>

      {conVideo.length > 0 && !verTodos && consulta.trim().length < 3 && (
        <button
          type="button"
          onClick={() => setVerTodos(true)}
          className="border-t border-border px-4 py-2.5 text-left text-xs font-medium text-accent hover:bg-surface-2"
        >
          Ver todos los videos de capacitación ({conVideo.length})
        </button>
      )}
    </div>
  );

  const video = reproduciendo ? videoDelPaso(reproduciendo, videos) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        aria-label="Ayuda: preguntar o ver un video"
        className="fixed bottom-4 right-3 z-40 flex h-14 items-center gap-2 rounded-full bg-brand-navy pl-4 pr-5 text-sm font-semibold text-white shadow-[var(--shadow-pop)] ring-2 ring-accent/40 transition hover:scale-[1.03] sm:right-5"
      >
        <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" />
          <path d="M7.8 7.7a2.2 2.2 0 1 1 2.9 2.1c-.5.2-.7.6-.7 1.1v.3" strokeLinecap="round" />
          <path d="M10 14.2h.01" strokeLinecap="round" />
        </svg>
        <span className="hidden sm:inline">{abierta ? "Cerrar" : "Ayuda"}</span>
      </button>

      {abierta && enElNavegador && createPortal(panel, document.body)}

      {reproduciendo &&
        video &&
        enElNavegador &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3"
            onClick={() => setReproduciendo(null)}
          >
            <div
              role="dialog"
              aria-label={`Video: ${reproduciendo.titulo}`}
              className="w-full max-w-5xl overflow-hidden rounded-xl bg-black shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 bg-brand-navy px-4 py-2.5 text-white">
                <p className="min-w-0 truncate text-sm font-semibold">
                  {reproduciendo.seccion} · {reproduciendo.titulo}
                </p>
                <button
                  type="button"
                  onClick={() => setReproduciendo(null)}
                  aria-label="Cerrar el video"
                  className="rounded-full px-2 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <video
                key={reproduciendo.id}
                src={`${CARPETA}/${video.archivo}`}
                poster={video.poster ? `${CARPETA}/${video.poster}` : undefined}
                controls
                autoPlay
                playsInline
                className="aspect-video w-full bg-black"
              />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
