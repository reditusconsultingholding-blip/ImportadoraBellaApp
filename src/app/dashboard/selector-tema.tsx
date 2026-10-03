"use client";

import { useSyncExternalStore } from "react";

/**
 * Claro, oscuro o el del sistema, desde el encabezado.
 *
 * Hasta ahora la app seguía al sistema operativo y punto. Eso falla en un caso
 * concreto y frecuente acá: alguien con el equipo en oscuro que necesita
 * mostrar una pantalla en una reunión, o imprimir un reporte, o que
 * sencillamente lee mejor en claro. Tenía que cambiar el tema de TODA su
 * computadora para cambiar el de una herramienta.
 *
 * Son tres estados y no dos a propósito. Un interruptor de dos deja a la
 * persona sin forma de volver a "lo que diga mi computadora", que es lo que
 * quiere la mayoría: claro de día y oscuro de noche sin tocar nada.
 */

type Tema = "sistema" | "claro" | "oscuro";
const CLAVE = "jarvis-tema";

const OPCIONES: { id: Tema; etiqueta: string; titulo: string }[] = [
  { id: "claro", etiqueta: "Claro", titulo: "Siempre claro" },
  { id: "oscuro", etiqueta: "Oscuro", titulo: "Siempre oscuro" },
  { id: "sistema", etiqueta: "Auto", titulo: "El que tenga tu computadora" },
];

/* ---------------------------------------------------------------------
 * El tema vive FUERA de React.
 *
 * Es un dato del navegador —localStorage y un atributo en <html>—, no estado
 * de un componente. Leerlo con `useSyncExternalStore` en vez de copiarlo a
 * estado dentro de un efecto evita el parpadeo de un primer render con el
 * valor equivocado, y deja que React resuelva solo la diferencia entre lo que
 * dibujó el servidor y lo que hay en esta máquina.
 * ------------------------------------------------------------------- */

let enMemoria: Tema | null = null;
const oyentes = new Set<() => void>();

function leerGuardado(): Tema {
  try {
    const v = window.localStorage.getItem(CLAVE);
    return v === "claro" || v === "oscuro" ? v : "sistema";
  } catch {
    // Almacenamiento bloqueado (incógnito, permisos): se sigue al sistema,
    // que es el comportamiento de siempre.
    return "sistema";
  }
}

function leer(): Tema {
  if (enMemoria === null) enMemoria = leerGuardado();
  return enMemoria;
}

/** En el servidor no hay preferencia posible: se asume la del sistema. */
const leerEnElServidor = (): Tema => "sistema";

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

function elegir(t: Tema) {
  enMemoria = t;
  const raiz = document.documentElement;
  if (t === "sistema") raiz.removeAttribute("data-tema");
  else raiz.setAttribute("data-tema", t);
  try {
    if (t === "sistema") window.localStorage.removeItem(CLAVE);
    else window.localStorage.setItem(CLAVE, t);
  } catch {
    // Que no se pueda recordar no impide aplicarlo en esta sesión.
  }
  for (const avisar of oyentes) avisar();
}

export default function SelectorTema() {
  const tema = useSyncExternalStore(suscribir, leer, leerEnElServidor);

  return (
    <div
      role="group"
      aria-label="Tema de la pantalla"
      className="hidden items-center gap-0.5 rounded-full border border-border p-0.5 sm:flex"
    >
      {OPCIONES.map((o) => {
        const activo = tema === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => elegir(o.id)}
            aria-pressed={activo}
            title={o.titulo}
            className={`rounded-full px-2 py-[3px] text-[11px] font-medium transition ${
              activo ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
