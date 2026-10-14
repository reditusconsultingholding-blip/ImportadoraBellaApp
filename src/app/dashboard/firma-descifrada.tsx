"use client";

import { useEffect, useState } from "react";
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
 * EL TEXTO FINAL ESTÁ EN EL HTML DESDE EL PRIMER MOMENTO. Se renderiza derecho
 * y recién después, ya en el navegador, se revuelve y se resuelve. Así quien
 * tenga JavaScript lento, o apagado, lee la firma igual — y nadie ve aparecer
 * basura en el lugar donde iba un nombre.
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

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLAVE) === claveDelDia()) return;
      window.localStorage.setItem(CLAVE, claveDelDia());
    } catch {
      // Sin almacenamiento se muestra: una vez de más no molesta a nadie.
    }

    const letras = [...texto];
    const inicio = performance.now();
    let id = 0;

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
    return () => clearTimeout(id);
  }, [texto]);

  return (
    <span
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
