"use client";

import { useEffect } from "react";

// Parte del seguimiento de actividad (ver src/lib/actividad.ts): lo que la
// persona escribe en un buscador. Las pantallas, acciones y descargas ya se
// registran en el servidor; los buscadores filtran en el navegador sin pedir
// nada, así que esto es lo único que hay que avisar desde acá.
//
// Se escucha a nivel de documento cualquier campo de búsqueda (type="search"
// o con "Buscar"/"Filtrar" en el placeholder), y se manda el término cuando la
// persona deja de escribir 1,5 s. No se registra nada de otros campos: ni
// claves, ni mensajes, ni formularios.

const PAUSA_MS = 1500;

function esBuscador(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.type === "password") return false;
  if (el.type === "search") return true;
  return /busc|filtr|search/i.test(`${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`);
}

export default function RegistroBusquedas() {
  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let ultimo = "";

    const mandar = (termino: string) => {
      if (termino.length < 2 || termino === ultimo) return;
      ultimo = termino;
      fetch("/api/actividad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termino, ruta: location.pathname + location.search }),
        keepalive: true,
      }).catch(() => {});
    };

    const alEscribir = (e: Event) => {
      if (!esBuscador(e.target)) return;
      const valor = e.target.value.trim();
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(() => mandar(valor), PAUSA_MS);
    };

    document.addEventListener("input", alEscribir, true);
    return () => {
      document.removeEventListener("input", alEscribir, true);
      if (temporizador) clearTimeout(temporizador);
    };
  }, []);

  return null;
}
