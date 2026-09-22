"use client";

// Un identificador que se copia de un toque.
//
// El código del producto y el SKU de Dropi se usan FUERA de Jarvis: se pegan
// en el nombre de una campaña, se buscan en Dropi, se mandan por WhatsApp.
// Hasta ahora había que seleccionarlos con el mouse letra por letra, y en una
// tabla donde el renglón entero es un enlace eso es incómodo: la mitad de las
// veces terminás abriendo la ficha en vez de copiar.
//
// Es un botón y no el texto suelto porque copiar tiene que ser una decisión,
// no un accidente al hacer clic en cualquier lado.

import { useState } from "react";

export default function CopiarId({
  valor,
  etiqueta,
  className = "",
}: {
  valor: string;
  /** Qué es lo que se copia, para el aviso y para quien usa lector de pantalla. */
  etiqueta?: string;
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar(e: React.MouseEvent) {
    // Suele vivir dentro de un enlace o de una fila que se despliega: sin esto,
    // copiar también navega.
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      // Navegador sin permiso de portapapeles: se selecciona para que al menos
      // se pueda copiar a mano.
      const s = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(e.currentTarget);
      s?.removeAllRanges();
      s?.addRange(r);
      return;
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1400);
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={copiado ? "Copiado" : `Copiar ${etiqueta ?? valor}`}
      aria-label={copiado ? "Copiado" : `Copiar ${etiqueta ?? valor}`}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] tabular-nums transition ${
        copiado
          ? "border-accent bg-good-bg text-accent-strong"
          : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-foreground"
      } ${className}`}
    >
      {valor}
      <span aria-hidden className="text-[9px] leading-none">
        {copiado ? "✓" : "⧉"}
      </span>
    </button>
  );
}
