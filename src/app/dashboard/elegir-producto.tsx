"use client";

import { useEffect, useRef, useState } from "react";

type Opcion = { id: string; code: string; name: string };

/**
 * Un desplegable de productos que arma sus opciones recién al usarlo.
 *
 * Las tablas de "Sin nomenclatura" tenían un <select> con el catálogo entero
 * en CADA fila: 37.557 <option> y 3,9 MB de HTML en una sola pantalla, que en
 * un teléfono son segundos de descarga y de armado antes de poder tocar nada.
 * Este muestra un campo igual a la vista y construye la lista cuando se hace
 * clic (o se llega con el teclado), abriéndola en el acto.
 */
export default function ElegirProducto({
  opciones,
  onElegir,
  disabled,
  placeholder = "Elegir producto…",
  className,
  ariaLabel,
}: {
  opciones: Opcion[];
  onElegir: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  ariaLabel: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!abierto || !ref.current) return;
    ref.current.focus();
    try {
      // Abre la lista sin un segundo clic donde el navegador lo permite.
      (ref.current as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      // Algunos navegadores solo lo permiten con un gesto directo: queda
      // enfocado y se abre con el próximo clic o con las flechas.
    }
  }, [abierto]);

  if (!abierto) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto(true)}
        onFocus={(e) => {
          // Llegando con Tab también se arma, para que el teclado funcione igual.
          if (e.currentTarget.matches(":focus-visible")) setAbierto(true);
        }}
        className={`${className ?? ""} text-left text-muted`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
      >
        {placeholder} ▾
      </button>
    );
  }

  return (
    <select
      ref={ref}
      defaultValue=""
      disabled={disabled}
      onChange={(e) => e.target.value && onElegir(e.target.value)}
      onBlur={(e) => {
        if (!e.target.value) setAbierto(false);
      }}
      className={className}
      aria-label={ariaLabel}
    >
      <option value="">{placeholder}</option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.code} — {o.name}
        </option>
      ))}
    </select>
  );
}
