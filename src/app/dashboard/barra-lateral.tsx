"use client";

import { useSyncExternalStore, type ReactNode } from "react";

/**
 * La barra lateral del escritorio: se pliega, y el verde respira.
 *
 * DOS COSAS QUE PIDIÓ SEBASTIÁN, Y SON LA MISMA.
 *
 * «Que deje esconder la barra de la izquierda»: en un monitor de portátil, 240
 * píxeles de menú contra una tabla de nueve columnas es mucho. Plegada quedan
 * 68 y siguen viéndose las piezas de cada sección, que es lo que se usa para
 * navegar una vez que uno se las sabe.
 *
 * «Ese verde se ve muy estático»: era un rectángulo de color plano de 240 por
 * la altura de la pantalla, el bloque más grande de la app y el único sin nada
 * adentro. Lleva ahora el mismo resplandor que respira del encabezado de cada
 * sección —mismo ciclo de 14 segundos, misma luz— y un filo claro en el borde
 * derecho. Si se nota mientras alguien busca una sección, está mal calibrado:
 * la idea es que la pantalla se sienta viva, no que se mueva.
 *
 * EL PLEGADO VIVE EN UN ATRIBUTO Y NO EN PROPIEDADES. El menú, la marca y el
 * bloque de la cuenta llegan armados desde el servidor; pasarles un booleano
 * obligaría a volverlos clientes a los tres. En vez de eso, acá se marca
 * `data-plegada` en el `<aside>` y el CSS esconde lo que lleva la clase
 * `solo-abierta`. Un atributo, una regla, y ningún componente que convertir.
 */

const CLAVE = "barra-plegada";

/* El mismo patrón del selector de tema: una preferencia que vive fuera de
   React, leída con `useSyncExternalStore`. Con un efecto que llama a
   `setState` el primer pintado siempre sería el equivocado. */
const oyentes = new Set<() => void>();

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

function leer() {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    // Modo incógnito o almacenamiento bloqueado: queda abierta.
    return false;
  }
}

/** En el servidor no hay preferencia: se pinta abierta. */
function leerEnElServidor() {
  return false;
}

function guardar(plegada: boolean) {
  try {
    window.localStorage.setItem(CLAVE, plegada ? "1" : "0");
  } catch {
    // Que no se pueda recordar no impide plegarla en esta sesión.
  }
  for (const avisar of oyentes) avisar();
}

/**
 * Si la barra está escondida. Lo necesita el menú, no solo la barra.
 *
 * Escondida no queda nada a la vista, así que los grupos cerrados tienen que
 * volver a abrirse: si no, al mostrarla de nuevo aparecería con secciones
 * escondidas que nadie cerró.
 */
export function useBarraPlegada() {
  return useSyncExternalStore(suscribir, leer, leerEnElServidor);
}

export default function BarraLateral({ children }: { children: ReactNode }) {
  const plegada = useBarraPlegada();

  return (
    <>
    <aside
      id="barra-lateral"
      data-plegada={plegada ? "1" : undefined}
      /* ESCONDIDA ES ESCONDIDA: ANCHO CERO, NO UNA COLUMNA DE ICONOS.

         La primera versión dejaba 68 píxeles con las piezas de cada sección a
         la vista. Sebastián: «que no aparezcan las herramientas, por que se ve
         feo». Tenía razón: una tira de iconos sueltos contra el borde no es un
         menú compacto, es un menú cortado. O está, o no está.

         EL ANCHO VA EN `style` Y NO EN UNA CLASE. `w-[68px]` llegaba al HTML
         pero no generaba ninguna regla: la busqué en el CSS compilado y no
         estaba. La barra se quedaba con la clase puesta y el ancho de siempre,
         que es el peor de los dos mundos — parece que funciona hasta que uno
         mide.

         Las cuatro propiedades y no solo `width` es cinturón y tirantes: este
         `<aside>` es un ítem flex, y aunque `width` alcanza mientras
         `flex-basis` sea `auto`, fijar las cuatro deja el ancho clavado sin
         depender de eso.

         AVISO PARA QUIEN VENGA A MEDIR ESTO. Chrome congela las transiciones
         CSS en las pestañas que están en segundo plano: quedan en `running`
         con `currentTime: 0`, y lo que se lee es el ancho de PARTIDA, no el de
         llegada. Midiendo desde fuera —automatización, una pestaña sin foco—
         la barra parece no esconderse nunca. Para medirla de verdad hay que
         terminar la transición a mano:
         `aside.getAnimations().forEach((a) => a.finish())`. */
      style={{
        flexBasis: plegada ? "0px" : "15rem",
        width: plegada ? "0px" : "15rem",
        minWidth: plegada ? "0px" : "15rem",
        maxWidth: plegada ? "0px" : "15rem",
      }}
      /* `overflow-hidden` recorta lo de adentro mientras se va: sin eso, los
         240 píxeles de menú se desbordan sobre la tabla durante la transición y
         se ve como si la pantalla se rompiera por un cuarto de segundo. */
      className="barra-lateral barra-con-transicion relative hidden shrink-0 overflow-hidden bg-brand-navy md:sticky md:top-0 md:flex md:h-screen md:flex-col"
      aria-hidden={plegada}
    >
      {/* El resplandor va en su propio contenedor recortado y detrás de todo:
          el menú se desplaza solo, y una luz que se desplazara con él se leería
          como un error de pintado. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className="encabezado-resplandor absolute -inset-10"
          style={{
            background:
              "radial-gradient(70% 45% at 20% 12%, rgb(0 164 124 / 0.22) 0%, rgb(0 164 124 / 0.06) 45%, transparent 72%)",
          }}
        />
        <span
          className="encabezado-resplandor absolute -inset-10"
          style={{
            background:
              "radial-gradient(60% 40% at 85% 88%, rgb(0 164 124 / 0.14) 0%, transparent 62%)",
            animationDelay: "-7s",
            animationDuration: "18s",
          }}
        />
        {/* El filo del borde derecho: separa la barra del lienzo gris sin
            pintar una línea dura. */}
        <span className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-brand-green/45 to-transparent" />
      </span>

      {/* El contenido conserva su ancho mientras la barra se cierra: si se
          encogiera con ella, el menú se reacomodaría en el camino y la salida
          se vería como un derrumbe en vez de un deslizamiento. */}
      <div className="relative flex min-h-0 w-60 flex-1 flex-col">{children}</div>
    </aside>
    <TiradorBarra plegada={plegada} />
    </>
  );
}

/**
 * El tirador que esconde y trae la barra.
 *
 * VIVE FUERA DEL `<aside>`, Y TIENE QUE SER ASÍ. La barra recorta lo que se
 * sale de ella para que el menú no se desborde sobre la tabla mientras se va;
 * un botón que asoma por el borde derecho se recortaría con todo lo demás, y
 * escondida —ancho cero— no quedaría nada que apretar para traerla de vuelta.
 *
 * Por eso va `fixed`, a la altura de la vista y no al final de una lista que
 * cambia de largo: abierta o escondida, está siempre en el mismo lugar de la
 * pantalla. Cuando la barra está, se apoya sobre su borde; cuando no, queda
 * pegado al canto izquierdo, que es donde la mano lo va a buscar.
 */
function TiradorBarra({ plegada }: { plegada: boolean }) {
  return (
    <button
      type="button"
      onClick={() => guardar(!plegada)}
      aria-expanded={!plegada}
      aria-controls="barra-lateral"
      title={plegada ? "Mostrar el menú" : "Esconder el menú"}
      aria-label={plegada ? "Mostrar el menú" : "Esconder el menú"}
      style={{ left: plegada ? 10 : 228 }}
      className="barra-con-transicion fixed top-[72px] z-30 hidden h-7 w-7 place-items-center rounded-full border border-white/15 bg-brand-navy text-white/75 shadow-[0_2px_6px_rgb(0_0_0/0.4)] transition hover:border-brand-green hover:text-white md:grid"
    >
      <svg
        viewBox="0 0 16 16"
        width="12"
        height="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={`transition-transform duration-200 ${plegada ? "rotate-180" : ""}`}
      >
        <path d="M10 3 5 8l5 5" />
      </svg>
    </button>
  );
}
