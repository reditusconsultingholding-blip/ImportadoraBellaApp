"use client";

import { useEffect, useState } from "react";

// La ayuda de una pantalla: qué es, para qué sirve y qué hay que hacer.
//
// Se abre sola la primera vez que alguien entra (y solo esa vez, se recuerda
// en el navegador), y después queda el botón "¿Cómo funciona?" siempre a mano.
// Es para las pantallas que no se explican con mirarlas: alguien que entra por
// primera vez a "Sin nomenclatura" no tiene forma de adivinar qué se espera
// que haga ahí ni por qué importa.

export type PasoAyuda = { titulo: string; texto: string };

export default function AyudaPantalla({
  id,
  titulo,
  resumen,
  pasos,
  porQue,
}: {
  /** Clave para recordar que ya se vio (una por pantalla). */
  id: string;
  titulo: string;
  resumen: string;
  pasos: PasoAyuda[];
  /** Por qué importa hacerlo: lo que se rompe si nadie lo hace. */
  porQue?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    // La primera vez se abre sola. Si el navegador no deja guardar (modo
    // privado), se abre siempre: es mejor de más que de menos.
    //
    // Con un temporizador de cero: cambiar el estado dentro del efecto mismo
    // dispara un segundo dibujado en cascada.
    const alToque = setTimeout(() => {
      try {
        if (!localStorage.getItem(`ayuda:${id}`)) setAbierto(true);
      } catch {
        setAbierto(true);
      }
    }, 0);
    return () => clearTimeout(alToque);
  }, [id]);

  function cerrar() {
    setAbierto(false);
    try {
      localStorage.setItem(`ayuda:${id}`, "1");
    } catch {
      // Sin memoria del navegador se vuelve a abrir la próxima vez. No es grave.
    }
  }

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cerrar es estable en la práctica
  }, [abierto]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-good-bg px-3 py-1.5 text-xs font-medium text-accent-strong transition hover:bg-good-bg/70"
      >
        <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full border border-accent/60 text-[10px]">
          ?
        </span>
        ¿Cómo funciona?
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={(e) => e.target === e.currentTarget && cerrar()}
        >
          <div role="dialog" aria-modal="true" aria-label={titulo} className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-pop">
            <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{resumen}</p>
              </div>
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="rounded px-2 py-1 text-lg leading-none text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                ×
              </button>
            </header>

            <ol className="flex flex-col gap-3 px-5 py-4">
              {pasos.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-good-bg text-[11px] font-semibold text-accent-strong">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{p.titulo}</span>
                    <span className="block text-xs leading-relaxed text-muted">{p.texto}</span>
                  </span>
                </li>
              ))}
            </ol>

            {porQue && (
              <p className="mx-5 mb-4 rounded border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
                <span className="font-semibold text-foreground">Por qué importa:</span> {porQue}
              </p>
            )}

            <footer className="flex justify-end border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={cerrar}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
              >
                Entendido
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
