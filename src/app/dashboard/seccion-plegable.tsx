"use client";

// Una sección del panel que se abre y se cierra.
//
// El panel había crecido hasta pedir cuatro pantallazos de scroll: ventas,
// atribución, ventas en el tiempo, alertas, pulso, catálogo y la tabla de
// campañas, todo desplegado al mismo tiempo. Quien entra a mirar cómo va el día
// se pierde antes de llegar abajo.
//
// Así que el panel abre con UNA sección abierta —las ventas— y el resto
// cerradas, cada una con su resumen a la vista en la barra: no hay que abrirla
// para saber si hay algo que mirar ahí dentro. Lo que cada persona abre se
// recuerda en su navegador, porque la sección que le importa a Emilia no es la
// que le importa a Fabricio.

import { useEffect, useState, type ReactNode } from "react";

/** Cómo se pinta la barra. `destacada` es la de atribución, que se busca mucho. */
type Tono = "normal" | "destacada";

const MARCO: Record<Tono, string> = {
  normal: "border-border bg-surface",
  destacada: "border-accent/45 border-l-4 border-l-accent bg-good-bg/25",
};

const BARRA: Record<Tono, string> = {
  normal: "hover:bg-surface-2",
  destacada: "bg-good-bg/60 hover:bg-good-bg/80",
};

export default function SeccionPlegable({
  id,
  eyebrow,
  titulo,
  resumen,
  etiqueta,
  tono = "normal",
  abiertaPorDefecto = false,
  children,
}: {
  /** Identifica la sección para recordar si quedó abierta. */
  id: string;
  /** Palabra corta en mayúsculas, a la izquierda. Igual que en Alertas y Pulso. */
  eyebrow?: string;
  titulo: string;
  /** Lo que se ve SIN abrir: el número que evita tener que abrirla. */
  resumen?: ReactNode;
  /** Pastilla a la derecha, normalmente el período. */
  etiqueta?: ReactNode;
  tono?: Tono;
  abiertaPorDefecto?: boolean;
  children: ReactNode;
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);

  // La preferencia guardada se lee después de pintar, no durante: el servidor
  // no tiene localStorage y leerlo en el primer render dejaría el HTML del
  // servidor distinto al del navegador.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(`panel:${id}`);
      if (guardado === "1" || guardado === "0") setAbierta(guardado === "1");
    } catch {
      // Navegador con el almacenamiento bloqueado: se queda el valor por defecto.
    }
  }, [id]);

  const alternar = () => {
    setAbierta((v) => {
      try {
        localStorage.setItem(`panel:${id}`, v ? "0" : "1");
      } catch {
        // Si no se puede recordar, igual se abre.
      }
      return !v;
    });
  };

  return (
    <section id={id} className={`overflow-hidden rounded border ${MARCO[tono]}`}>
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        aria-controls={`${id}-cuerpo`}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${BARRA[tono]}`}
      >
        {eyebrow && (
          <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted sm:inline">
            {eyebrow}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-semibold ${
              tono === "destacada" ? "text-accent-strong" : ""
            }`}
          >
            {titulo}
          </span>
          {resumen && <span className="mt-0.5 block text-xs text-muted">{resumen}</span>}
        </span>

        {etiqueta && (
          <span className="hidden shrink-0 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted md:inline">
            {etiqueta}
          </span>
        )}

        {/* El texto va al lado de la flecha: "abrir/cerrar" no se adivina de un
            triángulo, y esta gente entra al panel dos veces al día, no
            cincuenta. */}
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="hidden sm:inline">{abierta ? "cerrar" : "abrir"}</span>
          <span
            aria-hidden
            className={`inline-block transition-transform ${abierta ? "rotate-90" : ""}`}
          >
            ▸
          </span>
        </span>
      </button>

      {/* Cerrada no se dibuja: esconderla con CSS dejaría los gráficos
          calculándose y los textos dentro del buscador del navegador. */}
      {abierta && (
        <div id={`${id}-cuerpo`} className="border-t border-border">
          {children}
        </div>
      )}
    </section>
  );
}
