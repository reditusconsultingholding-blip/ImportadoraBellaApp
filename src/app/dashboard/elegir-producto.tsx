"use client";

import BuscadorProducto from "./buscador-producto";

type Opcion = { id: string; code: string; name: string };

/**
 * Elegir un producto en una fila de tabla, escribiendo.
 *
 * Antes era un <select> que armaba el catálogo entero al tocarlo (en "Sin
 * nomenclatura" había uno por fila: 37.557 <option> en una pantalla). Ahora es
 * el buscador de productos: se escribe el nombre, el código o las iniciales y
 * solo se dibujan las coincidencias. Al elegir, avisa y vuelve a quedar vacío.
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
  // Del estilo que traía la fila solo se conserva el ancho: el buscador tiene
  // su propio borde y relleno.
  const ancho = (className ?? "").split(/\s+/).filter((c) => /^(min-w|max-w|w)-/.test(c)).join(" ");
  return (
    <BuscadorProducto
      opciones={opciones.map((o) => ({ id: o.id, nombre: o.name, codigo: o.code }))}
      valor=""
      onElegir={(id) => id && onElegir(id)}
      placeholder={placeholder}
      className={ancho}
      ariaLabel={ariaLabel}
      disabled={disabled}
    />
  );
}
