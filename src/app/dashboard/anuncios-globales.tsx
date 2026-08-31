"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnuncioVista } from "@/lib/anuncios-datos";

// El anuncio que corta el paso al entrar a la app.
//
// El pedido era "notificaciones a todos los trabajadores que les salgan cuando
// entren a la app". Eso no es la campanita: ahí un aviso convive con veinte
// alertas de campaña y se lee cuando alguien tiene tiempo. Un anuncio del
// dueño —cambia el horario, se cierra el mes el viernes— tiene que verse sí o
// sí, así que se muestra encima de todo y no se va hasta que la persona lo
// acusa. Ese acuse es lo que además deja registro de quién se enteró.
//
// Va montado en el layout del panel para que aparezca sin importar en qué
// pantalla entró la persona.

/**
 * Cada cuánto se vuelve a preguntar si hay anuncios nuevos.
 *
 * Un minuto. El caso real no es "entré a la app", es "dejé la pestaña abierta
 * desde la mañana": sin esta consulta, un anuncio publicado a las once le
 * aparecería a medio equipo recién al día siguiente.
 */
const CONSULTA_MS = 60_000;

export default function AnunciosGlobales() {
  const [pendientes, setPendientes] = useState<AnuncioVista[]>([]);
  // Lo que esta persona ya acusó en esta sesión. Sin esto, una consulta que
  // salió antes del "Entendido" volvería a poner en pantalla el anuncio que
  // acaba de cerrar.
  const [acusados, setAcusados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    fetch("/api/chat/anuncios")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { pendientes?: AnuncioVista[] } | null) => {
        if (data?.pendientes) setPendientes(data.pendientes);
      })
      .catch(() => {
        // Sin red no hay anuncio que mostrar; se reintenta en un minuto.
      });
  }, []);

  useEffect(() => {
    cargar();
    const id = setInterval(cargar, CONSULTA_MS);
    return () => clearInterval(id);
  }, [cargar]);

  // Los más viejos primero: si hay tres sin ver, se leen en el orden en que se
  // publicaron, que es el orden en que pasaron las cosas.
  const cola = pendientes
    .filter((a) => !acusados.includes(a.id))
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const actual = cola[0];

  async function acusar() {
    if (!actual || guardando) return;
    setGuardando(true);
    try {
      await fetch("/api/chat/anuncios/visto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: actual.id }),
      });
    } catch {
      // Si el acuse no llegó, el anuncio va a volver a aparecer en la próxima
      // entrada. Es el error correcto: es peor darlo por leído sin registro.
    }
    setAcusados((prev) => [...prev, actual.id]);
    setGuardando(false);
  }

  if (!actual) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-pop)]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.09em] text-accent">
            <span aria-hidden>📣</span>
            Anuncio para el equipo
          </span>
          {/* Cuántos faltan. Sin el contador, cerrar uno y que aparezca otro se
              lee como si el botón no hubiera funcionado. */}
          {cola.length > 1 && (
            <span className="text-[11px] text-muted">1 de {cola.length}</span>
          )}
        </div>

        <div className="px-5 py-4">
          <h2 className="text-base font-semibold">{actual.titulo}</h2>
          <p className="mt-1 text-[11px] text-muted">
            Lo publicó {actual.autor.name} · {fechaCorta(actual.createdAt)}
          </p>
          {/* `whitespace-pre-wrap` para respetar los saltos de línea que escribió
              quien lo publicó: un anuncio con tres puntos aparte perdía la
              separación y quedaba como un párrafo ilegible. */}
          <p className="mt-3 max-h-[45vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
            {actual.cuerpo}
          </p>
        </div>

        {/* Un solo botón, y no hay forma de cerrar tocando afuera: el anuncio se
            va cuando la persona dice que lo vio, que es todo el punto. */}
        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            onClick={acusar}
            disabled={guardando}
            className="rounded bg-accent px-4 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Entendido"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * "30 de agosto, 14:05" en hora de Ecuador.
 *
 * Con zona fija y no con la del navegador: el mismo anuncio tiene que decir la
 * misma hora para quien lo mira desde Guayaquil y para quien lo mira desde
 * afuera, que es la misma razón por la que el chat formatea así sus fechas.
 */
function fechaCorta(iso: string) {
  return new Date(iso).toLocaleString("es-EC", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Guayaquil",
  });
}
