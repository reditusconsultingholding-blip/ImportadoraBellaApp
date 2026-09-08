"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ESTADOS_LOTE,
  ESTADO_LOTE_LABEL,
  TAMANOS_LOTE,
} from "@/lib/contenido-opciones";
import type { ProductOption } from "../_creativos/types";

type Lote = {
  id: string;
  numero: number;
  nomenclatura: string | null;
  tamanoObjetivo: number;
  fechaEntrega: string | null;
  estado: string;
  semana: string | null;
  responsable: { id: string; name: string } | null;
  product: { id: string; code: string; name: string };
  piezas: number;
};

function fechaLegible(iso: string | null) {
  if (!iso) return "Sin fecha";
  return new Date(iso).toLocaleDateString("es-EC", { day: "numeric", month: "short", timeZone: "UTC" });
}

// Panorama de todos los lotes de contenido, de todos los productos a la vez.
//
// Antes esta pantalla era solo de lectura y decía "se crean desde la ficha de
// cada producto". Para armar la semana había que entrar y salir de un producto
// por cada lote. Ahora se crean y se borran acá mismo; el detalle de mover
// piezas dentro de un lote sigue en la ficha del producto, que es donde están
// las piezas.
export default function LotesCruzados({
  canManage,
  products,
}: {
  canManage: boolean;
  products: ProductOption[];
}) {
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nuevo, setNuevo] = useState({
    productId: "",
    tamanoObjetivo: String(TAMANOS_LOTE[TAMANOS_LOTE.length - 1]),
    fechaEntrega: "",
  });

  // Se recarga por un contador y no llamando a una función desde los
  // manejadores: así el efecto es el único que toca la lista, y crear o borrar
  // solo dice "volvé a pedirla". Llamar a un cargador con setState desde el
  // cuerpo del efecto encadena renders y React lo desaconseja.
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let cancelado = false;
    const qs = filtroEstado ? `?estado=${filtroEstado}` : "";
    fetch(`/api/contenido/lotes${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelado) setLotes(d?.lotes ?? []);
      })
      .catch(() => {
        if (!cancelado) setLotes([]);
      });
    return () => {
      cancelado = true;
    };
  }, [filtroEstado, recarga]);

  const porProducto = useMemo(() => {
    const grupos = new Map<string, Lote[]>();
    for (const l of lotes ?? []) {
      const lista = grupos.get(l.product.id) ?? [];
      lista.push(l);
      grupos.set(l.product.id, lista);
    }
    return [...grupos.values()];
  }, [lotes]);

  function copiar(texto: string) {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(texto);
      setTimeout(() => setCopiado((c) => (c === texto ? null : c)), 1500);
    });
  }

  async function crear() {
    if (!nuevo.productId) {
      setError("Elegí el producto del lote.");
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/rondas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: nuevo.productId,
          tamanoObjetivo: Number(nuevo.tamanoObjetivo),
          fechaEntrega: nuevo.fechaEntrega || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? `El servidor respondió ${r.status}`);
      setCreando(false);
      setNuevo((n) => ({ ...n, productId: "", fechaEntrega: "" }));
      recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(l: Lote) {
    // Se avisa que las piezas NO se van: es lo que la gente teme al borrar un
    // lote, y el servidor efectivamente las conserva sueltas.
    const nombre = l.nomenclatura ?? `lote ${l.numero}`;
    const aviso =
      l.piezas > 0
        ? `¿Borrar el ${nombre}? Sus ${l.piezas} ${l.piezas === 1 ? "pieza queda suelta" : "piezas quedan sueltas"} y se pueden reasignar a otro lote. No se borra trabajo hecho.`
        : `¿Borrar el ${nombre}? No tiene piezas cargadas.`;
    if (!window.confirm(aviso)) return;

    setBorrando(l.id);
    setError(null);
    try {
      const r = await fetch(`/api/rondas?id=${encodeURIComponent(l.id)}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error ?? `El servidor respondió ${r.status}`);
      setLotes((p) => (p ? p.filter((x) => x.id !== l.id) : p));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBorrando(null);
    }
  }

  const claseCampo =
    "rounded border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-border-strong";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className={claseCampo}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {ESTADOS_LOTE.map((s) => (
            <option key={s} value={s}>
              {ESTADO_LOTE_LABEL[s]}
            </option>
          ))}
        </select>
        {canManage && !creando && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="ml-auto rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
          >
            + Nuevo lote
          </button>
        )}
      </div>

      {creando && (
        <div className="rounded border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Nuevo lote</p>
          <p className="mt-0.5 text-xs text-muted">
            El número y la nomenclatura los pone el sistema, siguiendo el último lote de ese
            producto.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">Producto</span>
              <select
                value={nuevo.productId}
                onChange={(e) => setNuevo((n) => ({ ...n, productId: e.target.value }))}
                className={`${claseCampo} min-w-[200px]`}
              >
                <option value="">Elegir producto…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">Piezas</span>
              <select
                value={nuevo.tamanoObjetivo}
                onChange={(e) => setNuevo((n) => ({ ...n, tamanoObjetivo: e.target.value }))}
                className={claseCampo}
              >
                {TAMANOS_LOTE.map((t) => (
                  <option key={t} value={t}>
                    {t} piezas
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">Entrega</span>
              <input
                type="date"
                value={nuevo.fechaEntrega}
                onChange={(e) => setNuevo((n) => ({ ...n, fechaEntrega: e.target.value }))}
                className={claseCampo}
              />
            </label>
            <button
              type="button"
              onClick={crear}
              disabled={guardando}
              className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-50"
            >
              {guardando ? "Creando…" : "Crear lote"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreando(false);
                setError(null);
              }}
              className="rounded border border-border px-3 py-1.5 text-xs transition hover:bg-surface-2"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">
          {error}
        </div>
      )}

      {lotes == null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : porProducto.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">
            {filtroEstado
              ? "Ningún lote en ese estado."
              : canManage
                ? "Todavía no hay lotes armados. Creá el primero con el botón de arriba."
                : "Todavía no hay lotes armados."}
          </p>
        </div>
      ) : (
        porProducto.map((grupo) => (
          <div key={grupo[0].product.id} className="overflow-hidden rounded border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-4 py-2.5">
              <p className="text-sm font-semibold">{grupo[0].product.name}</p>
              <Link
                href={`/dashboard/productos/${encodeURIComponent(grupo[0].product.code)}?vista=rondas`}
                className="text-xs text-accent-strong hover:underline"
              >
                Ver todos los lotes →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">Nomenclatura</th>
                    <th className="px-3 py-2">Responsable</th>
                    <th className="px-3 py-2">Piezas</th>
                    <th className="px-3 py-2">Entrega</th>
                    <th className="px-3 py-2">Estado</th>
                    {canManage && <th className="px-3 py-2 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody>
                  {grupo.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2">
                        {l.nomenclatura ? (
                          <button
                            onClick={() => copiar(l.nomenclatura as string)}
                            className="font-mono text-accent-strong hover:underline"
                          >
                            {l.nomenclatura}
                            {copiado === l.nomenclatura && (
                              <span className="ml-1 text-[10px] text-muted">¡copiado!</span>
                            )}
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{l.responsable?.name ?? "—"}</td>
                      <td className="px-3 py-2">
                        {l.piezas} de {l.tamanoObjetivo}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{fechaLegible(l.fechaEntrega)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {ESTADO_LOTE_LABEL[l.estado as never] ?? l.estado}
                      </td>
                      {canManage && (
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => borrar(l)}
                            disabled={borrando === l.id}
                            className="text-critical transition hover:underline disabled:opacity-50"
                          >
                            {borrando === l.id ? "Borrando…" : "Borrar"}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
