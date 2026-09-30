"use client";

import { useEffect, useState } from "react";

/**
 * Avisa cuando la pestaña está corriendo una versión vieja de Jarvis.
 *
 * ESTO EXISTE POR UNA SEMANA PERDIDA.
 *
 * Se arregló un permiso el 24, se publicó ese mismo día, y el 30 el equipo
 * seguía reportando exactamente el mismo problema. La base estaba bien, el
 * código estaba bien, el arreglo estaba compilado y desplegado. Lo que pasaba
 * es que nadie había recargado: Jarvis es una sola página que navega sin
 * volver a pedir el JavaScript, así que una pestaña abierta desde el lunes
 * sigue ejecutando el código del lunes toda la semana. El equipo la deja
 * abierta todo el día — es su herramienta de trabajo, no un sitio que se
 * visita.
 *
 * Desde afuera es indistinguible de un arreglo que no funcionó, y cuesta dos
 * rondas de "sigue pasando" descubrirlo. Con esto, la pestaña se entera sola.
 *
 * Se compara contra `/api/health`, que ya dice qué commit está sirviendo. No
 * se recarga sola: alguien puede estar a mitad de cargar una pieza y perder
 * lo escrito. Se avisa y decide la persona.
 */
export default function AvisoVersion({ versionCargada }: { versionCargada: string }) {
  const [hayOtra, setHayOtra] = useState(false);

  useEffect(() => {
    // Sin marca de versión no hay nada que comparar: en desarrollo, o si
    // algún día la variable deja de estar, esto se calla en vez de avisar
    // cada cinco minutos de una versión nueva que no existe.
    if (!versionCargada || versionCargada === "sin-marcar") return;

    let vivo = true;
    const mirar = async () => {
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { build?: string };
        if (vivo && j.build && j.build !== "sin-marcar" && j.build !== versionCargada) {
          setHayOtra(true);
        }
      } catch {
        // Sin internet o el servidor reiniciando: no es asunto de este aviso.
      }
    };

    // Cada cinco minutos, y al volver a la pestaña — que es cuando alguien
    // retoma después de un rato y es el mejor momento para enterarse.
    const reloj = window.setInterval(mirar, 5 * 60_000);
    const alVolver = () => document.visibilityState === "visible" && mirar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [versionCargada]);

  if (!hayOtra) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border border-accent bg-surface px-3.5 py-2.5 shadow-[var(--shadow-pop)]">
      <div className="text-xs leading-snug">
        <p className="font-medium">Hay una versión nueva de Jarvis</p>
        <p className="text-muted">Esta pestaña sigue con la anterior.</p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
      >
        Actualizar
      </button>
    </div>
  );
}
