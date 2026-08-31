"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { PasoCapacitacion } from "@/lib/capacitacion-pasos";

// El recorrido guiado de la herramienta.
//
// Vive en el layout del panel y no dentro de una pantalla: así el globo
// sobrevive a los cambios de página y puede llevar a la persona de una sección
// a otra sin perder en qué paso iba. Montado dentro de una página, cada salto
// lo destruiría y el recorrido arrancaría de cero cada vez.
//
// Qué explica cada paso está en `src/lib/capacitacion-pasos.ts`. Acá solo está
// la mecánica: moverse, navegar, cerrar y avisarle al servidor.

/** Lo que se puede enfocar con Tab dentro del globo. */
const ENFOCABLES = "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function CapacitacionTour({
  pasos,
  yaVista,
}: {
  pasos: PasoCapacitacion[];
  /** Si ya la hizo. Cuando no, el recorrido se abre solo al entrar. */
  yaVista: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Se abre solo la primera vez. Es el valor inicial del estado y no un
  // efecto: desde un efecto, el panel se pintaría un cuadro sin el globo y
  // este aparecería de golpe encima.
  const [abierto, setAbierto] = useState(() => !yaVista && pasos.length > 0);
  const [indice, setIndice] = useState(0);

  const globoRef = useRef<HTMLDivElement>(null);
  const lanzadorRef = useRef<HTMLButtonElement>(null);

  const paso = pasos[indice];
  const esUltimo = indice === pasos.length - 1;

  /**
   * Deja anotado en la base si ya la vio.
   *
   * No se espera la respuesta ni se bloquea nada con esto: si el pedido falla,
   * lo peor que pasa es que el recorrido vuelva a aparecer la próxima vez, que
   * es el lado seguro del error.
   */
  const anotar = useCallback((vista: boolean) => {
    fetch("/api/capacitacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vista }),
    }).catch(() => {});
  }, []);

  const irAPaso = useCallback(
    (siguiente: number) => {
      const destino = pasos[siguiente];
      if (!destino) return;
      setIndice(siguiente);
      // Solo se navega si hace falta: empujar la ruta en la que ya estamos
      // vuelve a pedirle la pantalla entera al servidor para nada.
      if (destino.ruta !== pathname) router.push(destino.ruta);
    },
    [pasos, pathname, router]
  );

  function abrir() {
    setAbierto(true);
    const destino = pasos[indice];
    if (destino && destino.ruta !== pathname) router.push(destino.ruta);
  }

  function terminar() {
    setAbierto(false);
    setIndice(0);
    anotar(true);
  }

  // Cerrar sin terminar NO la marca como vista: quien la interrumpe la retoma
  // después y en la próxima entrada le vuelve a aparecer. Saltarla es una
  // decisión distinta y tiene su propio botón.
  function cerrarPorAhora() {
    setAbierto(false);
  }

  // Escape para salir, y Tab que no se escapa del globo. El foco atrapado no
  // es adorno: sin eso, tabular desde el globo se va a los links de la
  // pantalla de atrás, que es justo lo que el recorrido está explicando y no
  // hay forma de saber dónde quedó el cursor.
  useEffect(() => {
    if (!abierto) return;
    const globo = globoRef.current;
    if (!globo) return;
    // El botón se guarda ahora y no al limpiar: el lanzador no se desmonta
    // mientras el recorrido está abierto, así que apunta al mismo nodo, y
    // leerlo acá es lo que espera la regla de los efectos.
    const lanzador = lanzadorRef.current;

    const enfocables = () => Array.from(globo.querySelectorAll<HTMLElement>(ENFOCABLES));
    enfocables()[0]?.focus();

    // Declarada como constante y no con `function`: una función declarada se
    // eleva por encima del `return` de arriba, y para el compilador `globo`
    // vuelve a poder ser nulo adentro.
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setAbierto(false);
        return;
      }
      if (e.key !== "Tab") return;

      const lista = enfocables();
      if (lista.length === 0) return;
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const activo = document.activeElement;
      const adentro = activo instanceof Node && globo.contains(activo);

      if (e.shiftKey && (activo === primero || !adentro)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (activo === ultimo || !adentro)) {
        e.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", alTeclado, true);
    return () => {
      document.removeEventListener("keydown", alTeclado, true);
      // Al cerrar, el foco vuelve al botón que lo abre. Si se dejara donde
      // estaba, quedaría en un nodo que ya no existe y el navegador lo manda
      // al principio del documento.
      lanzador?.focus();
    };
  }, [abierto]);

  if (pasos.length === 0) return null;

  return (
    <>
      <button
        ref={lanzadorRef}
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        title="Volver a ver la capacitación"
        className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
      >
        <svg
          viewBox="0 0 20 20"
          width="15"
          height="15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7.5" />
          <path d="M7.8 7.7a2.2 2.2 0 1 1 2.9 2.1c-.5.2-.7.6-.7 1.1v.3" />
          <path d="M10 14.2h.01" />
        </svg>
        <span className="hidden sm:inline">Capacitación</span>
        {/* El puntito solo mientras esté pendiente: después es un botón más. */}
        {!yaVista && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />}
      </button>

      {abierto && paso && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:justify-end sm:p-5">
          {/* Velo flojo a propósito: el recorrido habla de la pantalla que está
              detrás, taparla del todo sería explicarla a ciegas. Igual come los
              clics, que es la mitad de lo que sostiene el foco atrapado. */}
          <div
            className="absolute inset-0 bg-black/25"
            aria-hidden="true"
            onClick={cerrarPorAhora}
          />

          <div
            ref={globoRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="capacitacion-titulo"
            className="relative w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                {paso.seccion} · paso {indice + 1} de {pasos.length}
              </p>
              <button
                type="button"
                onClick={cerrarPorAhora}
                aria-label="Cerrar por ahora"
                className="-mt-1 -mr-1 grid h-7 w-7 shrink-0 place-items-center rounded text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                <svg
                  viewBox="0 0 20 20"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            {/* El texto se anuncia al cambiar de paso: el foco se queda en
                "Siguiente" para poder recorrerlo entero con Enter, y sin esto
                un lector de pantalla no leería nada de lo que cambió. */}
            <div aria-live="polite">
              <h2 id="capacitacion-titulo" className="mt-2 text-[17px] font-semibold leading-snug">
                {paso.titulo}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{paso.texto}</p>
              {paso.puntos.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {paso.puntos.map((punto) => (
                    <li key={punto} className="flex gap-2 text-[13px] leading-relaxed">
                      <span
                        aria-hidden="true"
                        className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent"
                      />
                      <span>{punto}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={terminar}
                className="text-left text-xs text-muted transition hover:text-foreground hover:underline"
              >
                {esUltimo ? "No volver a mostrarla" : "Saltarla y no volver a mostrarla"}
              </button>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => irAPaso(indice - 1)}
                  disabled={indice === 0}
                  className="rounded border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Atrás
                </button>
                {/* Un solo botón que cambia de texto en el último paso, en vez
                    de dos que se turnan: así React conserva el mismo nodo y el
                    foco no se cae al llegar al final. */}
                <button
                  type="button"
                  onClick={() => (esUltimo ? terminar() : irAPaso(indice + 1))}
                  className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
                >
                  {esUltimo ? "Terminar" : "Siguiente"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
