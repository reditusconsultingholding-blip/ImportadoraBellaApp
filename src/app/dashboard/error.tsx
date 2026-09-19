"use client";

import { useEffect } from "react";
import Link from "next/link";

// Lo que se ve cuando una pantalla del panel falla al armarse. Sin esto, Next
// muestra una página en blanco con "Application error" y la persona no sabe
// si perdió lo que estaba haciendo ni cómo seguir.
//
// El detalle técnico no se muestra (puede traer datos internos); queda en el
// log del servidor con el mismo código de referencia que se ve acá, así que
// quien reporte el problema puede pasar ese código y se encuentra el error.
export default function ErrorDelPanel({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">Esta pantalla no se pudo cargar</h1>
      <p className="mt-2 text-sm text-muted">
        Puede ser algo pasajero. Prueba de nuevo; si sigue fallando, avisa con el código de abajo.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
        >
          Reintentar
        </button>
        <Link href="/dashboard" className="rounded border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-2">
          Ir al inicio
        </Link>
      </div>
      {error.digest && <p className="mt-6 font-mono text-xs text-muted">Código: {error.digest}</p>}
    </div>
  );
}
