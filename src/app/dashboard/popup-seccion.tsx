"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import type { PasoCapacitacion } from "@/lib/capacitacion-pasos";
import { pasosDeLaPantalla } from "@/lib/ayuda-busqueda";
import { cargarManifiesto, grabacionDelPaso, textoDelPaso } from "@/lib/voz-capacitacion";
import { huellaDeTexto } from "@/lib/huella-texto";
import { CARPETA, cargarVideos, duracion, videoDelPaso, type ManifiestoVideos } from "./burbuja-ayuda";
import DialogoPropuesta from "./propuesta-dialogo";

// EL POP-UP DE CADA SECCIÓN (Sebastian, 20-nov: «creales el pop up
// explicativo… para que todo lo vean el paso a paso», como en Proyectar).
//
// La primera vez que alguien entra a una sección, después de haber hecho el
// recorrido completo, se abre solo con el video narrado de esa pantalla, lo
// que se hace ahí, y dos salidas: preguntar o proponer una mejora con la voz.
//
// Se recuerda por paso Y por la huella del texto: cuando una pantalla cambia
// y se reescribe su explicación, el pop-up vuelve a salir una vez, así el
// equipo se entera de lo nuevo sin que nadie tenga que avisarle.
//
// No sale mientras no se haya hecho el recorrido (el recorrido ya explica todo
// de corrido y serían dos ventanas encima) ni en las pantallas que no tienen
// un paso propio.

/** Pasos generales que no explican una pantalla en particular. */
const SIN_POPUP = new Set(["bienvenida", "novedades", "cierre", "sin-rol"]);
const APAGADO = "popup-seccion:apagado";

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: saldrá de nuevo, mejor de más que de menos */
  }
}

export default function PopupSeccion({
  pasos,
  yaVista,
  puedeJarvis,
}: {
  pasos: PasoCapacitacion[];
  yaVista: boolean;
  puedeJarvis: boolean;
}) {
  const enElNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const pathname = usePathname();
  const vista = useSearchParams().get("vista");
  const [videos, setVideos] = useState<ManifiestoVideos>({});
  const [audio, setAudio] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<PasoCapacitacion | null>(null);
  const [proponer, setProponer] = useState<null | "DUDA" | "MEJORA">(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const paso = useMemo(
    () => pasosDeLaPantalla(pasos, pathname, vista).find((p) => !SIN_POPUP.has(p.id)) ?? null,
    [pasos, pathname, vista],
  );

  useEffect(() => {
    if (!yaVista || !paso) return;
    const clave = `popup-seccion:${paso.id}`;
    const huella = huellaDeTexto(textoDelPaso(paso));
    if (leer(APAGADO) === "1" || leer(clave) === huella) return;
    let vivo = true;
    // Un respiro para que la pantalla se dibuje antes del pop-up.
    const t = setTimeout(async () => {
      const [m, voces] = await Promise.all([cargarVideos(), cargarManifiesto().catch(() => null)]);
      if (!vivo) return;
      setVideos(m);
      setAudio(grabacionDelPaso(paso.id, textoDelPaso(paso), voces));
      setAbierto(paso);
    }, 900);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [paso, yaVista]);

  function cerrar(noMostrarMas = false) {
    if (abierto) guardar(`popup-seccion:${abierto.id}`, huellaDeTexto(textoDelPaso(abierto)));
    if (noMostrarMas) guardar(APAGADO, "1");
    videoRef.current?.pause();
    setAbierto(null);
  }

  useEffect(() => {
    if (!abierto || proponer) return;
    const alTeclado = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", alTeclado);
    return () => document.removeEventListener("keydown", alTeclado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, proponer]);

  if (!enElNavegador) return null;
  const video = abierto ? videoDelPaso(abierto, videos) : null;

  return (
    <>
      {abierto &&
        !proponer &&
        createPortal(
          <div className="fixed inset-0 z-[65] flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={() => cerrar()}>
            <div
              role="dialog"
              aria-label={`Cómo funciona: ${abierto.seccion}`}
              className="flex max-h-[calc(100vh-24px)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 bg-brand-navy px-5 py-3.5 text-white">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    Cómo funciona · {abierto.seccion}
                  </p>
                  <p className="text-base font-semibold leading-snug">{abierto.titulo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => cerrar()}
                  aria-label="Cerrar"
                  className="rounded-full p-1 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto">
                {video ? (
                  <video
                    ref={videoRef}
                    src={`${CARPETA}/${video.archivo}`}
                    poster={video.poster ? `${CARPETA}/${video.poster}` : undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full bg-black"
                  />
                ) : (
                  audio && (
                    <div className="border-b border-border px-5 py-3">
                      <p className="mb-1 text-xs text-muted">Escúchalo:</p>
                      <audio src={audio} controls className="w-full" />
                    </div>
                  )
                )}
                <div className="px-5 py-4">
                  {video && (
                    <p className="mb-2 text-xs font-medium text-accent">
                      ▶ Dale play: el video te muestra esta pantalla con la voz, en {duracion(video.segundos)}.
                    </p>
                  )}
                  <p className="text-sm leading-relaxed text-foreground">{abierto.texto}</p>
                  {abierto.puntos.length > 0 && (
                    <ol className="mt-3 flex flex-col gap-2">
                      {abierto.puntos.map((p, i) => (
                        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-muted">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent">
                            {i + 1}
                          </span>
                          <span>{p}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setProponer("DUDA")}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
                >
                  🎙 Tengo una duda
                </button>
                <button
                  type="button"
                  onClick={() => setProponer("MEJORA")}
                  className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:border-accent"
                >
                  💡 Proponer una mejora
                </button>
                <button type="button" onClick={() => cerrar(true)} className="text-[11px] text-muted underline hover:text-foreground">
                  No mostrar más
                </button>
                <button
                  type="button"
                  onClick={() => cerrar()}
                  className="ml-auto rounded-full bg-accent px-5 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {proponer && abierto && (
        <DialogoPropuesta
          key={proponer}
          tipoInicial={proponer}
          seccion={abierto.seccion}
          ruta={vista ? `${pathname}?vista=${vista}` : pathname}
          puedeJarvis={puedeJarvis}
          onCerrar={() => {
            setProponer(null);
            cerrar();
          }}
        />
      )}
    </>
  );
}
