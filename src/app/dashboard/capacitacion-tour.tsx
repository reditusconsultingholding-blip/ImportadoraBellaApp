"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
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
const ENFOCABLES =
  "a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])";

/**
 * Donde esta, en pantalla, el enlace del menu que este paso explica.
 *
 * Se devuelve un TEXTO y no un objeto a proposito: useSyncExternalStore
 * compara por identidad, y un objeto nuevo en cada lectura lo haria girar sin
 * parar. Con una cadena, dos medidas iguales son iguales.
 */
function medirDestino(ruta: string | undefined) {
  if (typeof document === "undefined" || !ruta) return "";
  // El menu lateral esta oculto en el telefono; ahi no hay nada que iluminar
  // y el recorrido cae al velo parejo de siempre.
  const el = document.querySelector<HTMLElement>(`aside a[href="${ruta}"]`);
  if (!el) return "";
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return "";
  return [r.left, r.top, r.width, r.height].map((n) => Math.round(n)).join(",");
}

/** Vuelve a medir cuando algo puede haber movido el enlace. */
function alMoverse(avisar: () => void) {
  window.addEventListener("resize", avisar);
  // En captura, para enterarse tambien del scroll de la barra lateral y no
  // solo del de la ventana.
  window.addEventListener("scroll", avisar, true);
  return () => {
    window.removeEventListener("resize", avisar);
    window.removeEventListener("scroll", avisar, true);
  };
}

/** Cuantas veces se abre sola antes de esperar a que la pidan.
 *
 * Una sola vez es poco: quien entra por primera vez suele estar apurado por
 * ver la herramienta y la cierra sin leerla. Tres da margen para retomarla
 * sin que se vuelva un peaje diario.
 */
const MAXIMO_APERTURAS = 3;

export default function CapacitacionTour({
  pasos,
  yaVista,
  aperturas,
}: {
  pasos: PasoCapacitacion[];
  /** Si ya la terminó o la saltó. Entonces no se abre sola nunca más. */
  yaVista: boolean;
  /** Cuántas veces se le abrió sola hasta ahora. */
  aperturas: number;
}) {
  // El globo se dibuja en el <body>, no donde vive este componente.
  //
  // El boton "Capacitacion" esta dentro del encabezado, y el encabezado
  // tiene backdrop-blur. Un elemento con backdrop-filter pasa a ser el marco
  // de referencia de todo lo que tenga position: fixed adentro, asi que el
  // "fixed inset-0" del velo no ocupaba la pantalla: ocupaba los 56 pixeles
  // del encabezado. El globo aparecia arriba y cortado.
  //
  // Se pregunta si hay navegador con useSyncExternalStore y no con un efecto:
  // en el servidor no existe document, y hace falta una respuesta distinta
  // para cada lado sin que la hidratacion se queje.
  const enElNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const router = useRouter();
  const pathname = usePathname();

  // Se abre solo la primera vez. Es el valor inicial del estado y no un
  // efecto: desde un efecto, el panel se pintaría un cuadro sin el globo y
  // este aparecería de golpe encima.
  // Se abre sola solo las primeras veces. Despues hay que pedirla.
  //
  // Antes se abria en CADA entrada hasta que apretaran "Terminar" o
  // "Saltarla": quien la cerraba con la equis para atender algo urgente se la
  // encontraba de nuevo al dia siguiente, y al otro. Una ayuda que aparece
  // sin que la pidan y no se va deja de leerse como ayuda.
  const seAbreSola =
    !yaVista && pasos.length > 0 && aperturas < MAXIMO_APERTURAS;
  const [abierto, setAbierto] = useState(() => seAbreSola);
  const [indice, setIndice] = useState(0);

  const globoRef = useRef<HTMLDivElement>(null);
  const lanzadorRef = useRef<HTMLButtonElement>(null);

  // Se anota en la base que se abrio sola, para que la proxima cuente.
  //
  // Va en un efecto y no al construir el estado porque es un pedido al
  // servidor: durante el render no se sale a la red. La regla del lint prohibe
  // setState dentro de un efecto, no un fetch — sincronizar con un sistema
  // externo es justamente para lo que existen.
  //
  // Si el pedido falla no se hace nada: la cuenta se queda como estaba y el
  // recorrido se abre una vez de mas. Es el lado seguro del error.
  useEffect(() => {
    if (!seAbreSola) return;
    fetch("/api/capacitacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apertura: true }),
    }).catch(() => {});
    // Solo al montar: si dependiera de `seAbreSola`, un re-render con el mismo
    // valor volveria a contar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paso = pasos[indice];

  // Dónde iluminar. Se lee con useSyncExternalStore y no con un efecto: la
  // posición es un dato del navegador, no del estado de React, y así se vuelve
  // a leer sola cuando la ventana cambia de tamaño o algo se desplaza.
  const recorte = useSyncExternalStore(
    alMoverse,
    () => medirDestino(paso?.ruta),
    () => "",
  );
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
    [pasos, pathname, router],
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

    const enfocables = () =>
      Array.from(globo.querySelectorAll<HTMLElement>(ENFOCABLES));
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
        {!yaVista && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-accent"
            aria-hidden="true"
          />
        )}
      </button>

      {abierto &&
        paso &&
        enElNavegador &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:justify-end sm:p-5">
            {/* Atrapa los clics de toda la pantalla. Va aparte del oscurecido
                porque el oscurecido se dibuja con una sombra, y las sombras no
                reciben clics. */}
            <div
              className="absolute inset-0"
              aria-hidden="true"
              onClick={cerrarPorAhora}
            />

            {/* Lo que se explica queda a plena luz y el resto se apaga.

                El oscurecido es una sombra enorme HACIA AFUERA de este
                recuadro, no una capa encima: así el enlace del menú se ve tal
                cual, sin ningún filtro de por medio. Con una capa translúcida
                encima habría que redibujar el enlace más claro, y serían dos
                verdades sobre cómo se ve un mismo botón.

                Sin destino que medir —en el teléfono el menú está oculto— cae
                al velo parejo, que sigue siendo legible. */}
            {recorte ? (
              <div
                aria-hidden="true"
                className="pointer-events-none fixed rounded-md ring-2 ring-accent transition-all duration-200"
                style={{
                  left: Number(recorte.split(",")[0]) - 4,
                  top: Number(recorte.split(",")[1]) - 4,
                  width: Number(recorte.split(",")[2]) + 8,
                  height: Number(recorte.split(",")[3]) + 8,
                  boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
                }}
              />
            ) : (
              <div
                className="pointer-events-none absolute inset-0 bg-black/45"
                aria-hidden="true"
              />
            )}

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
                <h2
                  id="capacitacion-titulo"
                  className="mt-2 text-[17px] font-semibold leading-snug"
                >
                  {paso.titulo}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {paso.texto}
                </p>
                {paso.puntos.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {paso.puntos.map((punto) => (
                      <li
                        key={punto}
                        className="flex gap-2 text-[13px] leading-relaxed"
                      >
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
                  {esUltimo
                    ? "No volver a mostrarla"
                    : "Saltarla y no volver a mostrarla"}
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
                    onClick={() =>
                      esUltimo ? terminar() : irAPaso(indice + 1)
                    }
                    className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
                  >
                    {esUltimo ? "Terminar" : "Siguiente"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
