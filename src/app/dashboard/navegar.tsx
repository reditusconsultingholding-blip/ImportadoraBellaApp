"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Navegar avisando que se está cargando.
//
// El panel pide los datos al servidor cada vez que cambia el período, y con un
// año de historia eso tarda segundos. Antes no pasaba nada visible en ese rato:
// tocabas "12 meses" y la pantalla seguía mostrando lo de antes, igual de
// convencida. Quien mira no sabe si se está cargando, si no le hizo caso al
// clic, o si esos son los números nuevos.
//
// `useTransition` da exactamente el dato que falta: cuándo empezó y cuándo
// terminó de traerse la pantalla nueva. Y `destino` permite marcar SOLO el
// botón que se apretó, en vez de poner todo en duda.

export function useNavegar() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  // Cuál se pidió. Sin esto, al cargar se marcarían los ocho botones de
  // período y no se sabría cuál se apretó.
  const [destino, setDestino] = useState<string | null>(null);

  function navegar(url: string, clave?: string) {
    setDestino(clave ?? url);
    iniciar(() => {
      router.push(url, { scroll: false });
    });
  }

  return { navegar, pendiente, destino: pendiente ? destino : null };
}

/** El circulito que gira. Hereda el color del texto de alrededor. */
export function Girando({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * La barra fina de arriba mientras se carga.
 *
 * Va fija en el borde superior porque el clic puede estar en cualquier lado de
 * una pantalla larga: si el único aviso fuera el botón, alguien que apretó y
 * bajó a mirar la tabla no vería nada.
 */
export function BarraDeCarga({ activa }: { activa: boolean }) {
  if (!activa) return null;
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent"
    >
      <div className="h-full w-1/3 animate-[correr_1.1s_ease-in-out_infinite] bg-accent" />
    </div>
  );
}
