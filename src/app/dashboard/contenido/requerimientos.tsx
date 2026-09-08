"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { REQUIREMENT_STATUSES } from "@/lib/pipeline-options";
import RequirementsTable from "../_creativos/requirements-table";
import RequirementForm from "../_creativos/requirement-form";
import RequirementDrawer from "../_creativos/requirement-drawer";
import type { ProductOption, RequirementRow, UserOption } from "../_creativos/types";

// Los requerimientos, desde Contenido.
//
// Ya se podían crear y editar, pero solo entrando a la ficha de un producto:
// quien coordina el día no piensa "producto X, pieza Y", piensa "qué hay
// pendiente y de quién". Con lo anterior, para repartir el trabajo del día
// había que entrar y salir de ciento diecisiete productos.
//
// No se reescribió nada: la tabla, el formulario y la ficha de detalle son los
// mismos componentes de `_creativos/` que usa la pantalla de producto. Acá se
// agregan la vista cruzada y los filtros. Un segundo formulario propio habría
// significado dos sitios donde arreglar cada bug.

type Filtros = {
  texto: string;
  estado: string;
  responsable: string;
  producto: string;
};

const FILTROS_VACIOS: Filtros = { texto: "", estado: "", responsable: "", producto: "" };

export default function Requerimientos({
  canManage,
  currentUserId,
  users,
  products,
}: {
  canManage: boolean;
  currentUserId: string;
  users: UserOption[];
  products: ProductOption[];
}) {
  const [filas, setFilas] = useState<RequirementRow[] | null>(null);
  const [verCifras, setVerCifras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [creando, setCreando] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/requirements")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `El servidor respondió ${r.status}`);
        return j as { requirements: RequirementRow[]; verCifras: boolean };
      })
      .then((j) => {
        if (!vivo) return;
        setFilas(j.requirements);
        setVerCifras(j.verCifras);
      })
      .catch((e) => {
        if (!vivo) return;
        setError(e instanceof Error ? e.message : String(e));
        setFilas([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** Mete o reemplaza una fila sin volver a pedir la lista entera. */
  const upsert = useCallback((r: RequirementRow) => {
    setFilas((previas) => {
      if (!previas) return [r];
      const i = previas.findIndex((x) => x.id === r.id);
      if (i === -1) return [r, ...previas];
      const copia = previas.slice();
      copia[i] = r;
      return copia;
    });
  }, []);

  // La ficha de detalle también borra. Si el id que estaba abierto ya no está
  // en la lista al cerrarse, se saca: sin esto la fila borrada seguía en
  // pantalla hasta recargar y parecía que el borrado no había funcionado.
  const alCerrarDetalle = useCallback(() => {
    const id = detalleId;
    setDetalleId(null);
    if (!id) return;
    fetch(`/api/requirements/${id}`)
      .then((r) => {
        if (r.status === 404) setFilas((p) => (p ? p.filter((x) => x.id !== id) : p));
      })
      .catch(() => {});
  }, [detalleId]);

  const visibles = useMemo(() => {
    if (!filas) return [];
    const texto = filtros.texto.trim().toLowerCase();
    return filas.filter((r) => {
      if (filtros.estado && r.status !== filtros.estado) return false;
      if (filtros.responsable === "__sin__") {
        if (r.ownerId) return false;
      } else if (filtros.responsable && r.ownerId !== filtros.responsable) {
        return false;
      }
      if (filtros.producto && r.productId !== filtros.producto) return false;
      if (!texto) return true;
      return (
        r.adName.toLowerCase().includes(texto) ||
        (r.product?.name ?? "").toLowerCase().includes(texto) ||
        (r.product?.code ?? "").toLowerCase().includes(texto) ||
        (r.owner?.name ?? "").toLowerCase().includes(texto)
      );
    });
  }, [filas, filtros]);

  const hayFiltro = filtros.texto !== "" || filtros.estado !== "" || filtros.responsable !== "" || filtros.producto !== "";

  const sinResponsable = useMemo(
    () => (filas ?? []).filter((r) => !r.ownerId).length,
    [filas],
  );

  const claseCampo =
    "rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-border-strong focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Requerimientos</h2>
          <p className="mt-0.5 text-xs text-muted">
            Todas las piezas de todos los productos. Acá se crean, se asignan y se les carga el
            estado sin entrar producto por producto.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreando(true)}
            className="rounded bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
          >
            + Nuevo requerimiento
          </button>
        )}
      </div>

      {/* Un aviso, no un filtro escondido: una pieza sin responsable no le
          aparece a nadie en su día a día y se pierde en silencio. */}
      {sinResponsable > 0 && (
        <button
          type="button"
          onClick={() => setFiltros({ ...FILTROS_VACIOS, responsable: "__sin__" })}
          className="self-start rounded border border-warning bg-surface px-3 py-1.5 text-left text-xs text-warning transition hover:opacity-90"
        >
          {sinResponsable === 1
            ? "Hay 1 pieza sin responsable asignado."
            : `Hay ${sinResponsable} piezas sin responsable asignado.`}{" "}
          <span className="underline">Verlas</span>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filtros.texto}
          onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))}
          placeholder="Buscar por anuncio, producto o persona"
          className={`${claseCampo} min-w-[220px] flex-1`}
          aria-label="Buscar requerimientos"
        />
        <select
          value={filtros.estado}
          onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value }))}
          className={claseCampo}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {REQUIREMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filtros.responsable}
          onChange={(e) => setFiltros((f) => ({ ...f, responsable: e.target.value }))}
          className={claseCampo}
          aria-label="Filtrar por responsable"
        >
          <option value="">Todos los responsables</option>
          <option value="__sin__">Sin responsable</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          value={filtros.producto}
          onChange={(e) => setFiltros((f) => ({ ...f, producto: e.target.value }))}
          className={claseCampo}
          aria-label="Filtrar por producto"
        >
          <option value="">Todos los productos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
        {hayFiltro && (
          <button
            type="button"
            onClick={() => setFiltros(FILTROS_VACIOS)}
            className="text-xs text-muted underline transition hover:text-foreground"
          >
            Limpiar
          </button>
        )}
      </div>

      {filas === null ? (
        <p className="text-sm text-muted">Cargando requerimientos…</p>
      ) : error ? (
        <div className="rounded border border-critical bg-critical-bg p-4 text-sm text-critical">
          No se pudieron cargar los requerimientos: {error}
        </div>
      ) : filas.length === 0 ? (
        <div className="rounded border border-border bg-surface p-6 text-sm text-muted">
          Todavía no hay requerimientos.{" "}
          {canManage
            ? "Creá el primero con el botón de arriba."
            : "Cuando te asignen una pieza, aparece acá."}
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded border border-border bg-surface p-6 text-sm text-muted">
          Ninguna pieza coincide con el filtro.{" "}
          <button type="button" onClick={() => setFiltros(FILTROS_VACIOS)} className="underline">
            Limpiar el filtro
          </button>
          .
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">
            {visibles.length === filas.length
              ? `${filas.length} ${filas.length === 1 ? "pieza" : "piezas"}`
              : `${visibles.length} de ${filas.length} piezas`}
          </p>
          <RequirementsTable requirements={visibles} verCifras={verCifras} onOpen={setDetalleId} />
        </>
      )}

      {creando && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="relative w-full max-w-md rounded bg-brand-navy">
            <div className="border-b border-white/10 px-5 py-4">
              <h3 className="text-sm font-semibold text-white">Nuevo requerimiento</h3>
              <p className="mt-0.5 text-xs text-white/70">
                Elegí el producto al que pertenece la pieza. Una vez creada se abre sola para
                cargarle enlaces, métricas y estado.
              </p>
            </div>
            <div className="m-4 rounded border border-white/10 bg-surface p-4">
              <RequirementForm
                products={products}
                users={users}
                onCreated={(r) => {
                  upsert(r);
                  setCreando(false);
                  setDetalleId(r.id);
                }}
                onCancel={() => setCreando(false)}
              />
            </div>
          </div>
        </div>
      )}

      {detalleId && (
        <RequirementDrawer
          requirementId={detalleId}
          canManage={canManage}
          currentUserId={currentUserId}
          users={users}
          onClose={alCerrarDetalle}
          onUpdated={upsert}
        />
      )}
    </div>
  );
}
