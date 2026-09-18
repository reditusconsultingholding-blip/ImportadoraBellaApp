"use client";

import { useMemo, useState } from "react";

// Elegir productos escribiendo.
//
// Un <select> con ciento veinte productos obliga a bajar con la rueda hasta
// encontrar el que se busca, y a repetirlo por cada uno. Se pidió poder
// escribir "345" o "truly" y elegir de lo que aparece, como en la herramienta
// que el equipo ya usa. Se eligen varios a la vez y se aplican juntos, para no
// recargar la pantalla con cada clic.

type Producto = { id: string; code: string; name: string };

const normal = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SelectorProductos({
  productos,
  seleccion,
  onAplicar,
}: {
  productos: Producto[];
  seleccion: string[];
  onAplicar: (ids: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [marcados, setMarcados] = useState<string[]>(seleccion);

  const visibles = useMemo(() => {
    const t = normal(texto.trim());
    if (!t) return productos;
    return productos.filter((p) => normal(p.name).includes(t) || p.code.includes(t));
  }, [productos, texto]);

  const nombre = (id: string) => productos.find((p) => p.id === id)?.name ?? "—";

  const alternar = (id: string) =>
    setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  const abrir = () => {
    setMarcados(seleccion);
    setTexto("");
    setAbierto(true);
  };
  const aplicar = (ids: string[]) => {
    setAbierto(false);
    onAplicar(ids);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        className="flex min-w-[220px] items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs transition hover:border-border-strong"
        aria-expanded={abierto}
      >
        <span className={seleccion.length ? "text-foreground" : "text-muted"}>
          {seleccion.length === 0
            ? "Todos los productos"
            : seleccion.length === 1
              ? nombre(seleccion[0])
              : `${seleccion.length} productos`}
        </span>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden className="text-muted">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>

      {abierto && (
        <>
          {/* Clic afuera cierra sin aplicar. */}
          <button
            type="button"
            aria-label="Cerrar"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAbierto(false)}
          />
          <div className="absolute left-0 z-50 mt-1.5 w-[320px] overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
            <div className="border-b border-border p-2">
              <input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAbierto(false);
                  // Enter con un solo resultado lo marca: escribir "345" y Enter.
                  if (e.key === "Enter" && visibles.length === 1) alternar(visibles[0].id);
                }}
                placeholder="Buscar por nombre o código…"
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-accent"
              />
            </div>

            {marcados.length > 0 && (
              <div className="flex flex-wrap gap-1 border-b border-border px-2 py-2">
                {marcados.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => alternar(id)}
                    className="rounded-full bg-good-bg px-2 py-0.5 text-[11px] text-accent-strong transition hover:opacity-80"
                  >
                    {nombre(id)} ×
                  </button>
                ))}
              </div>
            )}

            <ul className="max-h-64 overflow-y-auto py-1">
              {visibles.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">Nada coincide con “{texto}”.</li>
              ) : (
                visibles.map((p) => {
                  const marcado = marcados.includes(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => alternar(p.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition hover:bg-surface-2"
                      >
                        <span
                          className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                            marcado ? "border-accent bg-accent text-white" : "border-border-strong"
                          }`}
                        >
                          {marcado && (
                            <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
                              <path d="M2 5.2L4 7L8 3" stroke="currentColor" strokeWidth="1.6" fill="none" />
                            </svg>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        <span className="shrink-0 text-[10px] text-muted">{p.code}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="flex items-center justify-between gap-2 border-t border-border p-2">
              <button
                type="button"
                onClick={() => aplicar([])}
                className="rounded px-2 py-1 text-xs text-muted transition hover:text-foreground"
              >
                Todos
              </button>
              <button
                type="button"
                onClick={() => aplicar(marcados)}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong"
              >
                Aplicar{marcados.length ? ` (${marcados.length})` : ""}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
