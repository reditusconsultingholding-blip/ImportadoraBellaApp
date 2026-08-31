"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// La barra de "hay una llamada" que se ve en TODA la app.
//
// Existe porque la sala de voz vive dentro de un canal del chat: si alguien
// está en Rentabilidad o en Pipeline, no tiene forma de enterarse de que el
// equipo se juntó a hablar. Antes eso se resolvía escribiendo "entren al voice"
// por mensaje, que es exactamente lo que la sala vino a evitar.
//
// Va montada en el layout del panel, arriba del encabezado, y no dentro del
// chat: el aviso sirve justamente cuando NO estás en el chat.

/**
 * Cada cuánto se pregunta si hay alguien en una sala.
 *
 * Diez segundos, no dos como el latido de adentro de la sala: acá no hay que
 * mantener una conexión viva, solo enterarse. Y esta consulta la hace TODA la
 * app en TODAS las pantallas, así que bajarla a dos segundos multiplicaría por
 * cinco los pedidos a la base sin que nadie note la diferencia.
 */
const CONSULTA_MS = 10_000;

type Sala = {
  channelId: string;
  nombre: string;
  personas: string[];
  yoEstoy: boolean;
};

/** "Fabrizio", "Fabrizio y Katherine", "Fabrizio, Katherine y 2 más". */
function quienes(personas: string[]) {
  const nombres = personas.map((n) => n.split(" ")[0]);
  if (nombres.length === 1) return nombres[0];
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  return `${nombres[0]}, ${nombres[1]} y ${nombres.length - 2} más`;
}

export default function AvisoLlamada() {
  const [salas, setSalas] = useState<Sala[]>([]);
  // Qué sala se cerró a mano. Se guarda el id del canal y no un simple "ya lo
  // cerré" para que una llamada NUEVA en otro canal vuelva a avisar: si fuera
  // un booleano, cerrar el aviso una vez apagaría el resto del día.
  const [cerrada, setCerrada] = useState<string | null>(null);

  // El estado se toca dentro del .then y no en el cuerpo del efecto, igual que
  // en la campana de notificaciones: hacerlo sincrónicamente ahí dispara un
  // render de más y no resiste el modo estricto de React.
  const cargar = useCallback(() => {
    // Con la pestaña de fondo no hace falta preguntar: nadie está mirando la
    // barra, y la respuesta va a estar vieja igual cuando vuelva.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    fetch("/api/chat/voz/activas")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { salas?: Sala[] } | null) => {
        if (data?.salas) setSalas(data.salas);
      })
      .catch(() => {
        // Una caída puntual de red no tiene que dejar un aviso pegado: en diez
        // segundos se vuelve a preguntar.
      });
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, CONSULTA_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Si ya estás adentro no hace falta avisarte: la sala está a la vista.
  const activa = salas.find((s) => !s.yoEstoy && s.channelId !== cerrada);
  if (!activa) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-good/30 bg-good-bg px-4 py-2 text-xs md:px-8">
      {/* El punto que late es la única parte que dice "esto está pasando
          ahora"; sin él la barra se lee como un aviso viejo que quedó ahí. */}
      <span className="flex items-center gap-2 font-medium text-good">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-good" />
        </span>
        Llamada en curso en #{activa.nombre}
      </span>

      <span className="text-muted">
        {quienes(activa.personas)} {activa.personas.length === 1 ? "está" : "están"} adentro
      </span>

      <Link
        href={`/dashboard/chat?c=channel:${activa.channelId}`}
        className="rounded bg-good px-2.5 py-1 font-medium text-white transition hover:opacity-90"
      >
        Entrar
      </Link>

      <button
        onClick={() => setCerrada(activa.channelId)}
        title="Ocultar este aviso"
        className="ml-auto px-1 text-muted transition hover:text-foreground"
      >
        ✕
      </button>
    </div>
  );
}
