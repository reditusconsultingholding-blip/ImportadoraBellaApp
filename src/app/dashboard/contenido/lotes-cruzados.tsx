"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ESTADOS_LOTE, ESTADO_LOTE_LABEL } from "@/lib/contenido-opciones";

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

// Panorama de todos los lotes de contenido, de todos los productos a la vez
// — para saber qué se está armando esta semana sin entrar producto por
// producto. Crear un lote y mover piezas dentro sigue siendo en la ficha del
// producto (pestaña Lotes), donde vive el detalle.
export default function LotesCruzados() {
  const [lotes, setLotes] = useState<Lote[] | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [copiado, setCopiado] = useState<string | null>(null);

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
  }, [filtroEstado]);

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="rounded border border-border bg-transparent px-2 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="">Todos los estados</option>
          {ESTADOS_LOTE.map((s) => (
            <option key={s} value={s}>
              {ESTADO_LOTE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {lotes == null ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : porProducto.length === 0 ? (
        <div className="rounded border border-border bg-surface p-8 text-center">
          <p className="text-sm text-muted">
            Todavía no hay lotes armados. Se crean desde la ficha de cada producto, pestaña
            &quot;Lotes&quot;.
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
