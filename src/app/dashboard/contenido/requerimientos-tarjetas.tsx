"use client";

import { useMemo, useState } from "react";
import type { RequirementRow, UserOption } from "../_creativos/types";
import PiezasProducto, { faltantes, type ProductoFicha } from "./piezas-producto";

// Requerimientos como tarjetas: por producto o por responsable.
//
// Antes, agrupar dibujaba todas las tablas una debajo de otra —"está toda la
// info para abajo, no se ve bien"—. Ahora cada producto (o cada persona) es una
// tarjeta con lo esencial: quién lo lleva, cuántas piezas hoy, cuántas sin
// clasificar. El detalle aparece solo al tocar la tarjeta, debajo de la fila
// de tarjetas, y se cierra tocándola de nuevo.

const hoyEcuador = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const diaDe = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 10);

type Tarjeta = {
  clave: string;
  titulo: string;
  subtitulo: string;
  piezas: RequirementRow[];
  hoy: number;
  sinClasificar: number;
  /** Para "por producto": la ficha, que da responsables y ángulos. */
  producto?: ProductoFicha;
};

export default function RequerimientosTarjetas({
  modo,
  filas,
  productos,
  users,
  canManage,
  currentUserId,
  onCambio,
  onAbrir,
  onProductos,
}: {
  modo: "producto" | "responsable";
  filas: RequirementRow[];
  productos: ProductoFicha[];
  users: UserOption[];
  canManage: boolean;
  currentUserId: string;
  onCambio: (r: RequirementRow) => void;
  onAbrir: (id: string) => void;
  onProductos: (p: ProductoFicha[]) => void;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  // Se abre con los que se están pautando. El resto del catálogo sigue a un
  // clic: son más de cien productos y en un mes se pautan veinte o treinta,
  // así que mostrarlos todos era hacer bajar y bajar para encontrar el de hoy.
  const [soloPautados, setSoloPautados] = useState(true);
  const [hoy] = useState(hoyEcuador);

  const tarjetas = useMemo<Tarjeta[]>(() => {
    const porClave = new Map<string, RequirementRow[]>();
    for (const r of filas) {
      const k = modo === "producto" ? (r.productId ?? "__sin__") : (r.ownerId ?? "__sin__");
      const l = porClave.get(k) ?? [];
      l.push(r);
      porClave.set(k, l);
    }

    const resumen = (piezas: RequirementRow[]) => ({
      hoy: piezas.filter((p) => diaDe(p.date) === hoy).length,
      sinClasificar: piezas.filter((p) => faltantes(p) > 0).length,
    });

    let lista: Tarjeta[];
    if (modo === "producto") {
      // Un editor ve sus productos aunque todavía no tengan piezas: es donde
      // va a cargar las de hoy. Dirección ve los que tienen piezas o responsables.
      const visibles = productos.filter((p) => {
        const mio = p.responsables.some((r) => r.id === currentUserId);
        const suyo = canManage ? porClave.has(p.id) || p.responsables.length > 0 : mio || porClave.has(p.id);
        // Un producto con piezas cargadas se ve siempre, esté o no pautado:
        // puede ser uno que recién se está preparando para salir.
        return suyo && (!soloPautados || p.pautado || porClave.has(p.id));
      });
      lista = visibles.map((p) => {
        const piezas = porClave.get(p.id) ?? [];
        return {
          clave: p.id,
          titulo: p.name,
          subtitulo: p.responsables.length ? p.responsables.map((r) => r.name.split(" ")[0]).join(" · ") : "Sin responsables",
          piezas,
          producto: p,
          ...resumen(piezas),
        };
      });
    } else {
      lista = [...porClave.entries()].map(([k, piezas]) => {
        const u = users.find((x) => x.id === k);
        const productosDe = new Set(piezas.map((p) => p.product?.name).filter(Boolean));
        return {
          clave: k,
          titulo: u?.name ?? "Sin responsable",
          subtitulo: `${productosDe.size} ${productosDe.size === 1 ? "producto" : "productos"}`,
          piezas,
          ...resumen(piezas),
        };
      });
    }

    const t = busqueda.trim().toLowerCase();
    if (t) lista = lista.filter((x) => x.titulo.toLowerCase().includes(t) || x.subtitulo.toLowerCase().includes(t));

    // Primero lo que tiene trabajo hoy, después lo que tiene piezas sin
    // clasificar, después el resto por nombre.
    return lista.sort((a, b) => b.hoy - a.hoy || b.sinClasificar - a.sinClasificar || a.titulo.localeCompare(b.titulo));
  }, [filas, productos, users, modo, canManage, currentUserId, busqueda, hoy, soloPautados]);

  // Cuántos se están dejando fuera, contados con la misma regla de permisos
  // que arriba: ofrecer "ver 80 más" cuando en realidad ninguno es suyo sería
  // un número inventado.
  const ocultos = useMemo(() => {
    if (modo !== "producto") return 0;
    const conPiezas = new Set(filas.map((r) => r.productId).filter(Boolean));
    return productos.filter((p) => {
      const mio = p.responsables.some((r) => r.id === currentUserId);
      const suyo = canManage ? conPiezas.has(p.id) || p.responsables.length > 0 : mio || conPiezas.has(p.id);
      return suyo && !p.pautado && !conPiezas.has(p.id);
    }).length;
  }, [modo, filas, productos, canManage, currentUserId]);

  const actual = tarjetas.find((t) => t.clave === abierta) ?? null;

  const puedeEditar = (t: Tarjeta) =>
    canManage || Boolean(t.producto?.responsables.some((r) => r.id === currentUserId));

  const actualizarFicha = (id: string, cambio: Partial<ProductoFicha>) =>
    onProductos(productos.map((p) => (p.id === id ? { ...p, ...cambio } : p)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={modo === "producto" ? "Buscar producto o responsable…" : "Buscar persona…"}
          className="w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-accent"
        />
        {modo === "producto" && (ocultos > 0 || !soloPautados) && (
          <button
            type="button"
            onClick={() => setSoloPautados((v) => !v)}
            className="rounded-full border border-border px-3 py-1.5 text-[11px] text-muted transition hover:border-border-strong hover:text-foreground"
          >
            {soloPautados ? `Ver también los que no se están pautando (${ocultos})` : "Ver solo los que se están pautando"}
          </button>
        )}
      </div>

      {tarjetas.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
          {modo === "producto" && !canManage
            ? "Todavía no tienes productos a cargo. Pídele a dirección que te asigne los tuyos."
            : "No hay nada que mostrar."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {tarjetas.map((t) => {
            const activa = t.clave === abierta;
            return (
              <button
                key={t.clave}
                type="button"
                onClick={() => setAbierta(activa ? null : t.clave)}
                aria-expanded={activa}
                className={`flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition ${
                  activa
                    ? "border-accent bg-good-bg/40 ring-1 ring-accent/30"
                    : "border-border bg-surface hover:border-border-strong hover:shadow-sm"
                }`}
              >
                <span className="truncate text-sm font-semibold">{t.titulo}</span>
                <span className="truncate text-[11px] text-muted">{t.subtitulo}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${t.hoy > 0 ? "bg-good-bg text-good" : "bg-surface-2 text-muted"}`}>
                    {t.hoy} hoy
                  </span>
                  {t.sinClasificar > 0 && (
                    <span className="rounded-full bg-pending-bg px-2 py-0.5 text-warning">
                      {t.sinClasificar} sin clasificar
                    </span>
                  )}
                  <span className="text-muted">{t.piezas.length} en total</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {actual && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold">{actual.titulo}</h3>
              <p className="text-xs text-muted">
                {actual.piezas.length} {actual.piezas.length === 1 ? "pieza" : "piezas"}
                {actual.sinClasificar > 0 && ` · ${actual.sinClasificar} sin clasificar`}
              </p>
            </div>
            {actual.producto && canManage && (
              <Responsables
                producto={actual.producto}
                users={users}
                onGuardado={(responsables) => actualizarFicha(actual.producto!.id, { responsables })}
              />
            )}
          </div>

          {actual.producto ? (
            <PiezasProducto
              producto={actual.producto}
              piezas={actual.piezas}
              users={users}
              canManage={canManage}
              puedeEditar={puedeEditar(actual)}
              onCambio={onCambio}
              onAbrir={onAbrir}
              onAngulo={(a) =>
                actualizarFicha(actual.producto!.id, {
                  angulosPropios: [...new Set([...actual.producto!.angulosPropios, a])],
                })
              }
            />
          ) : (
            // Por responsable: una tabla por cada producto de esa persona.
            [...new Set(actual.piezas.map((p) => p.productId))].map((pid) => {
              const ficha = productos.find((p) => p.id === pid);
              const piezas = actual.piezas.filter((p) => p.productId === pid);
              if (!ficha) return null;
              return (
                <div key={pid} className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold">{ficha.name}</p>
                  <PiezasProducto
                    producto={ficha}
                    piezas={piezas}
                    users={users}
                    canManage={canManage}
                    puedeEditar={canManage || ficha.responsables.some((r) => r.id === currentUserId)}
                    onCambio={onCambio}
                    onAbrir={onAbrir}
                    onAngulo={(a) =>
                      actualizarFicha(ficha.id, { angulosPropios: [...new Set([...ficha.angulosPropios, a])] })
                    }
                  />
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

/** Quién lleva el producto, editable por dirección. */
function Responsables({
  producto,
  users,
  onGuardado,
}: {
  producto: ProductoFicha;
  users: UserOption[];
  onGuardado: (r: { id: string; name: string }[]) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(producto.responsables.map((r) => r.id));
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(producto.code)}/responsables`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: marcados }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? `El servidor respondió ${res.status}`);
      onGuardado(j.responsables);
      setEditando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setMarcados(producto.responsables.map((r) => r.id));
          setEditando(true);
        }}
        className="rounded-lg border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
      >
        Responsables: {producto.responsables.length ? producto.responsables.map((r) => r.name.split(" ")[0]).join(", ") : "ninguno"} · editar
      </button>
    );
  }

  const editores = users.filter((u) => u.role === "EDITOR");
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted">
        Solo los responsables cargan y editan las piezas de {producto.name}, y a ellos les llega el
        aviso de las ocho si quedan sin clasificar.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {editores.map((u) => {
          const on = marcados.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setMarcados((m) => (on ? m.filter((x) => x !== u.id) : [...m, u.id]))}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                on ? "border-accent bg-good-bg text-accent-strong" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {u.name}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-critical">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={guardar} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-strong">
          Guardar
        </button>
        <button type="button" onClick={() => setEditando(false)} className="px-2 text-xs text-muted hover:text-foreground">
          Cancelar
        </button>
      </div>
    </div>
  );
}
