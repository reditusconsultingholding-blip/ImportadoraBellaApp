"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { buscarProductos } from "@/lib/buscar-producto";

// Un campo para elegir un producto escribiendo: nombre, código o iniciales.
// Reemplaza los desplegables de productos de toda la app (ver
// src/lib/buscar-producto.ts para cómo se busca).
//
// Solo dibuja las coincidencias (hasta 50), nunca el catálogo entero: por eso
// sirve también en tablas con un buscador por fila, donde un <select> con
// cientos de opciones en cada renglón hacía pesada la pantalla.

export type OpcionProducto = {
  id: string;
  nombre: string;
  codigo?: string;
  /** Texto chico a la derecha (costo, "sin pauta"…). */
  detalle?: string;
};

export default function BuscadorProducto({
  opciones,
  valor,
  onElegir,
  placeholder = "Buscar producto…",
  vacio,
  className = "",
  ariaLabel = "Producto",
  disabled,
}: {
  opciones: OpcionProducto[];
  /** El id elegido, o "" si ninguno. */
  valor: string;
  onElegir: (id: string) => void;
  placeholder?: string;
  /** Si se puede volver a "ninguno", con qué texto ("Todos los productos"). */
  vacio?: string;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const elegido = opciones.find((o) => o.id === valor) ?? null;
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const resultados = useMemo(
    () => buscarProductos(opciones, texto, (o) => ({ nombre: o.nombre, codigo: o.codigo })),
    [opciones, texto],
  );
  // La primera fila es "ninguno" cuando se permite.
  const filas: (OpcionProducto | null)[] = vacio && !texto ? [null, ...resultados] : resultados;

  // Cerrar al tocar fuera.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) {
        setAbierto(false);
        setTexto("");
      }
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, [abierto]);

  // La fila activa siempre a la vista al moverse con las flechas.
  useEffect(() => {
    lista.current?.children[activo]?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  function elegir(o: OpcionProducto | null) {
    onElegir(o?.id ?? "");
    setAbierto(false);
    setTexto("");
  }

  const mostrado = abierto ? texto : elegido ? `${elegido.codigo ? `${elegido.codigo} · ` : ""}${elegido.nombre}` : "";

  return (
    <div ref={caja} className={`relative ${className}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-label={ariaLabel}
        disabled={disabled}
        value={mostrado}
        placeholder={elegido ? undefined : (vacio ?? placeholder)}
        onFocus={() => {
          setAbierto(true);
          setActivo(0);
        }}
        onChange={(e) => {
          setTexto(e.target.value);
          setAbierto(true);
          setActivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setActivo((a) => Math.min(a + 1, filas.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (abierto && filas.length > 0) {
              e.preventDefault();
              elegir(filas[activo] ?? null);
            }
          } else if (e.key === "Escape") {
            setAbierto(false);
            setTexto("");
            e.currentTarget.blur();
          }
        }}
        className="w-full rounded border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus:border-accent disabled:opacity-50"
        autoComplete="off"
      />
      {abierto && (
        <ul
          ref={lista}
          id={idLista}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-auto rounded border border-border bg-surface py-1 shadow-lg"
        >
          {filas.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted">Ningún producto coincide con «{texto}».</li>
          )}
          {filas.map((o, i) => (
            <li
              key={o?.id ?? "__ninguno__"}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => {
                // mousedown y no click: el click llega después del blur y
                // la lista ya se habría cerrado.
                e.preventDefault();
                elegir(o);
              }}
              onMouseEnter={() => setActivo(i)}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-sm ${
                i === activo ? "bg-good-bg text-foreground" : "text-foreground/90"
              }`}
            >
              {o ? (
                <>
                  <span className="min-w-0 truncate">
                    {o.codigo && <span className="mr-1.5 font-mono text-[11px] text-muted">{o.codigo}</span>}
                    {o.nombre}
                  </span>
                  {o.detalle && <span className="shrink-0 text-[11px] text-muted">{o.detalle}</span>}
                </>
              ) : (
                <span className="text-muted">{vacio}</span>
              )}
            </li>
          ))}
          {resultados.length === 50 && (
            <li className="px-3 py-1.5 text-[11px] text-muted">Hay más: sigue escribiendo para acotar.</li>
          )}
        </ul>
      )}
    </div>
  );
}
