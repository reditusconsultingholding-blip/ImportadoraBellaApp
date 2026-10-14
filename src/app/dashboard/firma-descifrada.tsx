"use client";

import { useEffect, useRef, useState } from "react";
import { claveDelDia } from "@/lib/frases-del-dia";

/**
 * «by Reditus Developers», descifrándose la primera vez que alguien entra.
 *
 * Pedido de Sebastián: «que el "reditus developers" al cargar aparezca como en
 * un formato tipo encriptado y pum aparezca, un efecto élite una vez al día
 * cuando recién entre».
 *
 * CÓMO SE LEE. Cada letra arranca como un carácter al azar y se va fijando de
 * izquierda a derecha, como un candado que cede. Dura poco más de un segundo:
 * lo bastante para verlo, no tanto como para esperarlo. Mientras se resuelve va
 * en verde de marca y en monoespaciada —si las letras cambiaran de ancho, el
 * renglón bailaría— y al fijarse vuelve al gris de siempre.
 *
 * UNA VEZ POR DÍA, Y POR ESO MISMO VALE. Un efecto en cada carga es un peaje:
 * a la tercera del día ya molesta, y a la décima alguien pide quitarlo. Una vez
 * por jornada se queda en lo que es, un saludo. Comparte la marca de día con el
 * arranque —la fecha de Ecuador— pero su propia llave: son dos saludos
 * distintos y ninguno tiene por qué apagar al otro.
 *
 * POR QUÉ ESPERA EN VEZ DE ARRANCAR AL MONTARSE. La primera versión arrancaba
 * de una, y Sebastián reportó que no se veía nunca. Tres razones, las tres
 * reales y las tres silenciosas:
 *
 *   1. ESTA FIRMA SE RENDERIZA DOS VECES —una en la barra de escritorio y otra
 *      en el cajón del teléfono— y solo una está visible a la vez. Las dos
 *      corrían a la vez, la primera marcaba el día como visto y la otra se
 *      quedaba sin efecto. Medio a medio, la que animaba era la invisible.
 *   2. EL ARRANQUE DEL DÍA TAPA LA PANTALLA ENTERA. Justo el día que el efecto
 *      toca, el pop-up está encima: la firma se descifraba debajo del velo y
 *      para cuando alguien cerraba, ya había terminado.
 *   3. CON LA BARRA PLEGADA la firma mide cero píxeles de ancho.
 *
 * Por eso ahora espera a estar de verdad en pantalla: que no haya nada encima,
 * y que el elemento ocupe lugar. La marca del día se escribe recién al empezar
 * a animar, no al montarse — si no, la instancia oculta volvería a robársela.
 */

const CLAVE = "firma-descifrada";
/** De dónde salen los caracteres del revoltijo. */
const RUIDO = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%&/<>{}[]$@";
/** Cuánto tarda en resolverse del todo. */
const TOTAL_MS = 1150;
/** Cada cuánto se repinta mientras se resuelve. */
const PASO_MS = 45;

export default function FirmaDescifrada({ texto }: { texto: string }) {
  const [mostrado, setMostrado] = useState(texto);
  // Se deduce, no se guarda aparte: dos estados para una misma cosa es la
  // forma de que un día digan distinto. Mientras lo pintado no sea el texto,
  // se está resolviendo.
  const cifrando = mostrado !== texto;
  const caja = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const limpiezas: (() => void)[] = [];
    let id = 0;
    limpiezas.push(() => clearTimeout(id));

    const yaSeVioHoy = () => {
      try {
        return window.localStorage.getItem(CLAVE) === claveDelDia();
      } catch {
        // Sin almacenamiento se muestra: una vez de más no molesta a nadie.
        return false;
      }
    };

    const animar = () => {
      if (yaSeVioHoy()) return;
      try {
        window.localStorage.setItem(CLAVE, claveDelDia());
      } catch {
        // Idem: que no se pueda recordar no impide mostrarlo.
      }

      const letras = [...texto];
      const inicio = performance.now();

      const pintar = () => {
        const t = Math.min(1, (performance.now() - inicio) / TOTAL_MS);
        // Cuántas letras quedaron fijas. Avanza con el cuadrado del tiempo: al
        // principio lento —se ve el revoltijo— y al final de golpe, que es el
        // «pum» que pidió Sebastián. Lineal se siente a cinta transportadora.
        const fijas = Math.floor(letras.length * t * t);
        setMostrado(
          letras
            .map((ch, i) => {
              if (i < fijas || ch === " ") return ch;
              return RUIDO[Math.floor(Math.random() * RUIDO.length)];
            })
            .join(""),
        );
        if (t >= 1) {
          setMostrado(texto);
          return;
        }
        id = window.setTimeout(pintar, PASO_MS);
      };

      // El primer repintado va en el temporizador y no acá: cambiar el estado
      // en el cuerpo del efecto encadena renders de más.
      id = window.setTimeout(pintar, PASO_MS);
    };

    /** Cuando el elemento ocupe lugar en la pantalla. */
    const alEstarVisible = () => {
      const el = caja.current;
      if (!el) return;
      if (el.getBoundingClientRect().width > 0) {
        animar();
        return;
      }
      // Ancho cero: la barra está plegada o esta copia es la del teléfono.
      // Se queda esperando sin costo; si nunca se abre, nunca anima, que es
      // exactamente lo que corresponde.
      const vigia = new IntersectionObserver((entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        vigia.disconnect();
        animar();
      });
      vigia.observe(el);
      limpiezas.push(() => vigia.disconnect());
    };

    // Si el arranque del día está encima, primero se espera a que se cierre.
    if (document.documentElement.hasAttribute("data-arranque")) {
      window.addEventListener("arranque-cerrado", alEstarVisible, { once: true });
      limpiezas.push(() => window.removeEventListener("arranque-cerrado", alEstarVisible));
    } else {
      alEstarVisible();
    }

    return () => limpiezas.forEach((f) => f());
  }, [texto]);

  return (
    <span
      ref={caja}
      // El nombre de verdad para quien use lector de pantalla: lo que se anima
      // es decoración, y leer el revoltijo en voz alta no es un saludo.
      aria-label={texto}
      className={`block leading-none transition-colors duration-300 ${
        cifrando ? "font-mono text-brand-green" : "text-white/45"
      }`}
    >
      <span aria-hidden>{mostrado}</span>
    </span>
  );
}
