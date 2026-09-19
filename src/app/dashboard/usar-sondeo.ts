"use client";

import { useEffect, useRef } from "react";

/**
 * Repite `fn` cada `cadaMs` SOLO mientras la pestaña está a la vista.
 *
 * Antes cada consulta periódica (campana, anuncios, aviso de llamada,
 * refresco del panel) seguía corriendo con la pestaña en segundo plano: una
 * persona con cinco pestañas abiertas eran cinco veces las consultas, todas
 * compitiendo con quien sí estaba usando la app. Al volver a la pestaña se
 * pone al día en el acto si ya pasó el intervalo.
 */
export function useSondeo(fn: () => void, cadaMs: number, { alMontar = true }: { alMontar?: boolean } = {}) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    let ultimo = 0;
    const correr = () => {
      ultimo = Date.now();
      fnRef.current();
    };
    if (alMontar) correr();
    else ultimo = Date.now();

    const id = setInterval(() => {
      if (!document.hidden) correr();
    }, cadaMs);
    const alVolver = () => {
      if (!document.hidden && Date.now() - ultimo >= cadaMs) correr();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [cadaMs, alMontar]);
}
