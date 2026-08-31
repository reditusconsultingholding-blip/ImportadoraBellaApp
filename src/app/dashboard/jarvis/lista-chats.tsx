"use client";

import { useState } from "react";

type Conversacion = { id: string; titulo: string; updatedAt: string };

function cuando(iso: string) {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias === 0) return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return d.toLocaleDateString("es-EC", { day: "numeric", month: "short" });
}

export default function ListaChats({
  conversaciones,
  activa,
  onAbrir,
  onNueva,
  onBorrar,
}: {
  conversaciones: Conversacion[];
  activa: string | null;
  onAbrir: (id: string) => void;
  onNueva: () => void;
  onBorrar: (id: string) => void;
}) {
  // Cuál está esperando confirmación de borrado.
  const [porBorrar, setPorBorrar] = useState<string | null>(null);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border">
      <button
        type="button"
        onClick={onNueva}
        className="m-2 rounded bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
      >
        Nueva conversación
      </button>

      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {conversaciones.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted">
            Todavía no hay conversaciones guardadas.
          </p>
        )}

        {conversaciones.map((c) => (
          // El renglón entero es el botón de abrir y el de borrar va encima.
          // Un botón dentro de otro botón es HTML inválido y el navegador lo
          // reacomoda solo, así que el contenedor es un div.
          <div
            key={c.id}
            className={`group mb-0.5 flex items-center gap-1 rounded px-2 py-1.5 transition ${
              activa === c.id ? "bg-surface-2" : "hover:bg-surface-2/60"
            }`}
          >
            <button
              type="button"
              onClick={() => onAbrir(c.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm">{c.titulo}</span>
              <span className="block text-[11px] text-muted">{cuando(c.updatedAt)}</span>
            </button>

            {/* Preguntar antes de borrar.
                Borrar una conversación no se deshace, y la ✕ vive pegada al
                renglón que se abre: un clic de más y se pierde el razonamiento
                de por qué se apagó un producto. */}
            {porBorrar === c.id ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onBorrar(c.id);
                    setPorBorrar(null);
                  }}
                  className="rounded bg-critical px-2 py-1 text-[11px] font-medium text-white transition hover:opacity-90"
                >
                  Borrar
                </button>
                <button
                  type="button"
                  onClick={() => setPorBorrar(null)}
                  className="rounded px-1.5 py-1 text-[11px] text-muted transition hover:text-foreground"
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setPorBorrar(c.id)}
                aria-label={`Borrar la conversación ${c.titulo}`}
                title="Borrar"
                // Aparece al pasar por encima, pero con foco de teclado también:
                // si solo respondiera al mouse, no habría forma de borrar sin él.
                className="shrink-0 rounded px-1.5 py-1 text-xs text-muted opacity-0 transition hover:bg-critical-bg hover:text-critical focus:opacity-100 group-hover:opacity-100"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
