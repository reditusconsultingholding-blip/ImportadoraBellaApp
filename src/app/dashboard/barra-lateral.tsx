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
 * Si la barra está plegada. Lo necesita el menú, no solo la barra.
 *
 * Plegada, los títulos de grupo desaparecen —a 68 px no entra «PRODUCCIÓN»—,
 * y con ellos el único botón que abre un grupo cerrado. Sin esto, plegar la
 * barra con «Números» cerrado escondía siete secciones sin manera de llegar a
 * ellas: la barra quedaba con cinco iconos y el resto desaparecido.
 */
export function useBarraPlegada() {
  return useSyncExternalStore(suscribir, leer, leerEnElServidor);
}

export default function BarraLateral({ children }: { children: ReactNode }) {
  const plegada = useBarraPlegada();

  return (
    <aside
      data-plegada={plegada ? "1" : undefined}
      /* EL ANCHO VA EN `style`, Y SOBRE `flexBasis`.

         Dos cosas, las dos medidas en la app en vivo y no deducidas.

         Primera: `w-[68px]` llegaba al HTML pero no generaba ninguna regla
         —la busqué en el CSS compilado y no existe—, así que la barra se
         quedaba en 240 px con la clase puesta. Es el peor de los dos mundos:
         parece que funciona hasta que uno mide.

         Segunda, y la que de verdad costaba: este `<aside>` es un ítem flex
         dentro del contenedor de la página, y ahí `width` no decide el ancho
         usado. Puesto `style="width: 68px"` seguía midiendo 240; con
         `flex-basis: 68px` pasó a 68 al instante. Se fijan las cuatro
         propiedades juntas para que el ancho sea el mismo en cualquier
         contexto, sea el elemento ítem flex o no. */
      style={{
        flexBasis: plegada ? "68px" : "15rem",
        width: plegada ? "68px" : "15rem",
        minWidth: plegada ? "68px" : "15rem",
        maxWidth: plegada ? "68px" : "15rem",
      }}
      className="barra-lateral barra-con-transicion relative hidden shrink-0 bg-brand-navy md:sticky md:top-0 md:flex md:h-screen md:flex-col"
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

      <button
        type="button"
        onClick={() => guardar(!plegada)}
        aria-expanded={!plegada}
        title={plegada ? "Mostrar el menú" : "Esconder el menú"}
        aria-label={plegada ? "Mostrar el menú" : "Esconder el menú"}
        /* Pegado al borde derecho y a la altura de la vista, no al final de la
           lista: plegada o abierta, el botón está siempre en el mismo lugar. */
        className="absolute -right-3 top-[72px] z-20 grid h-6 w-6 place-items-center rounded-full border border-white/15 bg-brand-navy text-white/70 shadow-[0_1px_4px_rgb(0_0_0/0.35)] transition hover:border-brand-green hover:text-white"
      >
        <svg
          viewBox="0 0 16 16"
          width="11"
          height="11"
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

      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </aside>
  );
}
