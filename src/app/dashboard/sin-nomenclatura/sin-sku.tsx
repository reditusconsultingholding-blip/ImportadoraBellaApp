"use client";

// Los productos que no están conectados a Dropi.
//
// Un producto de Shopify que viene de Dropi trae su SKU, que es el ID con el
// que vive allá. El que no lo trae, casi siempre, es catálogo viejo: se creó
// para una prueba, se dejó de vender y quedó flotando. La tienda tiene más de
// quinientos así, y por eso emparejar campañas con productos se vuelve una
// pesadilla — hay que elegir entre decenas de nombres que ya no existen para
// el negocio.
//
// Esta lista es la que hay que revisar para depurar. No borra nada: archivar
// un producto es una decisión de quien conoce el catálogo, y archivarlo desde
// acá de a uno es lo que hace que la limpieza se pueda hacer en ratos sueltos
// en vez de en una sesión de una semana.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CopiarId from "../copiar-id";

export type ProductoSinSku = {
  id: string;
  code: string;
  name: string;
  /** Si tuvo gasto de pauta en los últimos 90 días. Con pauta NO se archiva. */
  conPautaReciente: boolean;
  campanas: number;
};

export default function SinSku({ productos }: { productos: ProductoSinSku[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [archivados, setArchivados] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);

  if (productos.length === 0) return null;

  async function archivar(p: ProductoSinSku) {
    setOcupado(p.id);
    setError(null);
    try {
      const res = await fetch(`/api/productos/${encodeURIComponent(p.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "No se pudo archivar.");
      }
      setArchivados((a) => ({ ...a, [p.id]: true }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo archivar.");
    } finally {
      setOcupado(null);
    }
  }

  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? productos.filter((p) => p.name.toLowerCase().includes(q) || p.code.includes(q))
    : productos;
  const conPauta = productos.filter((p) => p.conPautaReciente).length;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Productos sin SKU</span>
          <span className="block text-xs text-muted">
            A {productos.length} productos no se les pudo confirmar el SKU — son los primeros
            candidatos a revisar
            {conPauta > 0 && (
              <span className="text-warning"> · {conPauta} igual tienen pauta reciente</span>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
          <span className="hidden sm:inline">{abierto ? "cerrar" : "abrir"}</span>
          <span aria-hidden className={`inline-block transition-transform ${abierto ? "rotate-90" : ""}`}>
            ▸
          </span>
        </span>
      </button>

      {abierto && (
        <div className="border-t border-border px-4 py-3">
          <p className="mb-3 text-xs leading-relaxed text-muted">
            Un producto que viene de Dropi trae su SKU, así que no tenerlo suele significar
            catálogo viejo que quedó flotando — y es lo que hace pesado emparejar campañas: hay
            que elegir entre decenas de nombres que ya no se venden. <b>Ojo: también puede ser
            que el nombre de acá no coincida con el de la tienda</b>, así que conviene mirar
            cada uno antes de archivarlo. Archivar no borra nada —el producto sigue en
            Productos, en «Inactivos», con toda su historia— pero lo saca de los buscadores y
            de las listas de todos los días.
          </p>

          {error && (
            <p className="mb-2 rounded border border-critical bg-critical-bg px-2.5 py-1.5 text-xs text-critical">
              {error}
            </p>
          )}

          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="mb-3 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent"
          />

          <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto">
            {visibles.map((p) => (
              <li
                key={p.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-border px-2.5 py-1.5 ${
                  archivados[p.id] ? "opacity-45" : ""
                }`}
              >
                <CopiarId valor={p.code} etiqueta={`el código de ${p.name}`} />
                <Link
                  href={`/dashboard/productos/${encodeURIComponent(p.code)}`}
                  className="min-w-[10rem] flex-1 truncate text-sm hover:text-accent-strong hover:underline"
                >
                  {p.name}
                </Link>

                <span className="shrink-0 text-xs text-muted">
                  {p.campanas > 0
                    ? `${p.campanas} ${p.campanas === 1 ? "campaña" : "campañas"}`
                    : "sin campañas"}
                </span>

                {/* Un producto con pauta viva NO es candidato a archivar,
                    tenga SKU o no: alguien le está poniendo plata hoy. */}
                {p.conPautaReciente ? (
                  <span className="shrink-0 rounded-full border border-warning/40 bg-pending-bg px-2 py-0.5 text-[10px] font-medium text-warning">
                    con pauta reciente — no archivar
                  </span>
                ) : archivados[p.id] ? (
                  <span className="shrink-0 text-xs text-good">archivado</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => archivar(p)}
                    disabled={ocupado === p.id}
                    className="shrink-0 rounded border border-border px-2 py-1 text-xs font-medium transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    {ocupado === p.id ? "Archivando…" : "Archivar"}
                  </button>
                )}
              </li>
            ))}
            {visibles.length === 0 && (
              <li className="py-3 text-center text-sm text-muted">Ningún producto coincide.</li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
