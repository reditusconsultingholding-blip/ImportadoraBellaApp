"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import PulseLine, { type PulseTone } from "../pulse-line";
import { STATUS_LABEL } from "@/lib/pipeline-options";
import type { PulsoCreativosVisible, VeredictoCreativos } from "@/lib/pulso-creativos";
import RequirementDrawer from "./requirement-drawer";
import RequirementForm from "./requirement-form";
import type { ProductOption, RequirementRow, UserOption } from "./types";

// Todos los productos, ordenados por lo que hay que producir hoy.
//
// El pipeline arrancaba en el tablero de piezas, que responde "¿en qué está
// trabajando el equipo?". Pero el trabajo no nace ahí: nace en un producto que
// se está quedando sin creativos o en uno que está ganando y aguanta más. Por
// eso esta vista existe, y por eso se entra a producir desde acá — con el
// producto ya elegido, en vez de buscarlo otra vez entre ciento diecisiete.

const VEREDICTO: Record<
  VeredictoCreativos,
  { titulo: string; corto: string; chip: string; tono: PulseTone }
> = {
  NECESITA: {
    titulo: "Necesita creativos ya",
    corto: "Necesita creativos",
    chip: "bg-critical-bg text-critical border-critical/30",
    tono: "RIESGO",
  },
  ESCALAR: {
    titulo: "Escalar: más de lo que ya funciona",
    corto: "Para escalar",
    chip: "bg-good-bg text-accent-strong border-accent/40",
    tono: "SANO",
  },
  SUFICIENTE: {
    titulo: "No necesita por ahora",
    corto: "Al día",
    chip: "bg-surface-2 text-muted border-border",
    tono: "SIN_DATOS",
  },
  SIN_DATOS: {
    titulo: "Sin pauta suficiente para juzgarlo",
    corto: "Sin pauta",
    chip: "bg-surface-2 text-muted border-border",
    tono: "SIN_DATOS",
  },
};

const ORDEN_FILTROS: VeredictoCreativos[] = ["NECESITA", "ESCALAR", "SUFICIENTE", "SIN_DATOS"];

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Las piezas que ya no están en producción. */
const TERMINADO = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

export default function ProductosPulso({
  pulsos,
  verCifras,
  initialRequirements,
  users,
  canManage,
  currentUserId,
  ventanaDias,
}: {
  /** Ya recortados en el servidor: sin cifras no traen gasto ni CPA. */
  pulsos: PulsoCreativosVisible[];
  verCifras: boolean;
  initialRequirements: RequirementRow[];
  users: UserOption[];
  canManage: boolean;
  currentUserId: string;
  ventanaDias: number;
}) {
  const [requirements, setRequirements] = useState(initialRequirements);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"" | VeredictoCreativos>("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creandoPara, setCreandoPara] = useState<ProductOption | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  function upsert(requirement: RequirementRow) {
    setRequirements((prev) => {
      const existe = prev.some((r) => r.id === requirement.id);
      return existe
        ? prev.map((r) => (r.id === requirement.id ? requirement : r))
        : [requirement, ...prev];
    });
  }

  // Las piezas de cada producto se reparten una sola vez, no una búsqueda por
  // fila: con ciento diecisiete productos abiertos eso se nota.
  const porProducto = useMemo(() => {
    const mapa = new Map<string, RequirementRow[]>();
    for (const r of requirements) {
      if (!r.productId) continue;
      const lista = mapa.get(r.productId) ?? [];
      lista.push(r);
      mapa.set(r.productId, lista);
    }
    return mapa;
  }, [requirements]);

  const conteos = useMemo(() => {
    const c: Record<VeredictoCreativos, number> = {
      NECESITA: 0,
      ESCALAR: 0,
      SUFICIENTE: 0,
      SIN_DATOS: 0,
    };
    for (const p of pulsos) c[p.veredicto] += 1;
    return c;
  }, [pulsos]);

  // Siete columnas con gasto y CPA; seis cuando esas dos se vuelven una.
  const columnas = verCifras ? 7 : 6;

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return pulsos.filter((p) => {
      if (filtro && p.veredicto !== filtro) return false;
      if (!q) return true;
      return plano(p.name).includes(q) || plano(p.code).includes(q);
    });
  }, [pulsos, busqueda, filtro]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-border bg-surface px-4 py-3">
        <p className="text-sm">
          {conteos.NECESITA > 0 ? (
            <>
              <strong className="text-critical">{conteos.NECESITA}</strong>{" "}
              {conteos.NECESITA === 1 ? "producto pide" : "productos piden"} creativos nuevos
            </>
          ) : (
            "Ningún producto pide creativos nuevos"
          )}
          {conteos.ESCALAR > 0 && (
            <>
              {" · "}
              <strong className="text-accent-strong">{conteos.ESCALAR}</strong>{" "}
              {conteos.ESCALAR === 1 ? "aguanta" : "aguantan"} más presupuesto y{" "}
              {conteos.ESCALAR === 1 ? "conviene" : "conviene"} producir variaciones de lo que ya
              gana
            </>
          )}
          .
        </p>
        <p className="mt-1 text-xs text-muted">
          Últimos {ventanaDias} días contra los {ventanaDias} anteriores. El costo por compra sale
          de las compras que ATRIBUYE cada plataforma, no de las órdenes cobradas en Shopify:
          sirven para comparar una semana contra otra, no para contar ventas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto o código…"
          className="min-w-[200px] rounded border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:border-accent"
        />
        <button
          onClick={() => setFiltro("")}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            filtro === ""
              ? "border-accent bg-good-bg text-accent-strong"
              : "border-border text-muted hover:border-border-strong hover:text-foreground"
          }`}
        >
          Todos ({pulsos.length})
        </button>
        {ORDEN_FILTROS.map((v) => (
          <button
            key={v}
            onClick={() => setFiltro(filtro === v ? "" : v)}
            title={VEREDICTO[v].titulo}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              filtro === v
                ? "border-accent bg-good-bg text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {VEREDICTO[v].corto} ({conteos[v]})
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-3">Producto</th>
                <th className="px-5 py-3">Veredicto</th>
                {/* Gasto y CPA solo con el permiso de finanzas. Las compras
                    ocupan su lugar: es la medida de volumen que sí
                    corresponde ver, y sin ella la fila quedaría sin nada que
                    diga de qué tamaño es el producto. */}
                {verCifras ? (
                  <>
                    <th className="px-5 py-3 text-right">Gasto {ventanaDias}d</th>
                    <th className="px-5 py-3 text-right">CPA</th>
                  </>
                ) : (
                  <th className="px-5 py-3 text-right">Compras {ventanaDias}d</th>
                )}
                <th className="px-5 py-3 text-right">vs. semana previa</th>
                <th className="px-5 py-3 text-right">Creativos vivos</th>
                <th className="px-5 py-3 text-right">Piezas</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const piezas = porProducto.get(p.productId) ?? [];
                const estaAbierto = abierto === p.productId;
                const v = VEREDICTO[p.veredicto];
                return (
                  <Fragment key={p.productId}>
                    <tr
                      onClick={() => setAbierto(estaAbierto ? null : p.productId)}
                      className="cursor-pointer border-t border-border transition hover:bg-surface-2"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <PulseLine serie={p.serie} state={v.tono} width={54} height={20} />
                          <div>
                            <Link
                              href={`/dashboard/productos/${encodeURIComponent(p.code)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="font-medium hover:text-accent hover:underline"
                            >
                              {p.name}
                            </Link>
                            <p className="font-mono text-xs text-muted">{p.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-1 text-xs font-medium ${v.chip}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {v.corto}
                        </span>
                      </td>
                      {verCifras ? (
                        <>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {money(p.gasto ?? 0)}
                          </td>
                          <td className="px-5 py-3 text-right tabular-nums">
                            {p.cpa != null ? money2(p.cpa) : "—"}
                          </td>
                        </>
                      ) : (
                        <td className="px-5 py-3 text-right tabular-nums">
                          {p.compras > 0 ? p.compras.toLocaleString("es-EC") : "—"}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right tabular-nums">
                        {p.variacionCpa == null ? (
                          <span className="text-muted" title="No hay compras suficientes en las dos semanas">
                            —
                          </span>
                        ) : (
                          <span className={p.variacionCpa > 0 ? "text-critical" : "text-good"}>
                            {p.variacionCpa > 0 ? "+" : "−"}
                            {Math.abs(Math.round(p.variacionCpa * 100))}%
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums">
                        {p.creativosExigidos > 0 ? (
                          <span className={p.creativosVivos < p.creativosExigidos ? "text-warning" : ""}>
                            {p.creativosVivos} / {p.creativosExigidos}
                          </span>
                        ) : (
                          <span className="text-muted">{p.creativosVivos}</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted">
                        {piezas.length}
                      </td>
                    </tr>

                    {estaAbierto && (
                      <tr className="border-t border-border bg-surface-2/60">
                        <td colSpan={columnas} className="px-5 py-4">
                          <div className="flex flex-col gap-4">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.07em] text-muted">
                                {v.titulo}
                              </p>
                              <ul className="mt-2 flex flex-col gap-1.5">
                                {p.motivos.map((m, i) => (
                                  <li key={i} className="flex gap-2 text-xs leading-relaxed">
                                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted" />
                                    <span>{m}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.07em] text-muted">
                                  Requerimientos de este producto ({piezas.length})
                                </p>
                                {canManage && (
                                  <button
                                    onClick={() =>
                                      setCreandoPara({ id: p.productId, code: p.code, name: p.name })
                                    }
                                    className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white"
                                  >
                                    + Nuevo requerimiento para {p.code}
                                  </button>
                                )}
                              </div>

                              {piezas.length === 0 ? (
                                <p className="mt-2 text-xs text-muted">
                                  Todavía no tiene piezas cargadas en el pipeline.
                                </p>
                              ) : (
                                <div className="mt-2 overflow-hidden rounded border border-border bg-surface">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-border text-left text-muted">
                                        <th className="px-3 py-2">Fecha</th>
                                        <th className="px-3 py-2">Anuncio</th>
                                        <th className="px-3 py-2">Formato</th>
                                        <th className="px-3 py-2">Ángulo</th>
                                        <th className="px-3 py-2">Awareness</th>
                                        <th className="px-3 py-2">Editor</th>
                                        <th className="px-3 py-2">Situación</th>
                                        <th className="px-3 py-2">Estado en pauta</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {piezas.map((r) => (
                                        <tr
                                          key={r.id}
                                          onClick={() => setDetalleId(r.id)}
                                          className="cursor-pointer border-t border-border transition hover:bg-surface-2"
                                        >
                                          <td className="whitespace-nowrap px-3 py-2 text-muted">
                                            {new Date(r.date).toLocaleDateString("es-EC", {
                                              day: "2-digit",
                                              month: "short",
                                              timeZone: "UTC",
                                            })}
                                          </td>
                                          <td className="max-w-[16rem] truncate px-3 py-2 font-medium">
                                            {r.adName}
                                          </td>
                                          <td className="max-w-[10rem] truncate px-3 py-2 text-muted">
                                            {r.visualFormat}
                                          </td>
                                          <td className="max-w-[10rem] truncate px-3 py-2 text-muted">
                                            {r.angle}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2 text-muted">
                                            {r.awarenessLevel}
                                          </td>
                                          <td className="px-3 py-2 text-muted">
                                            {r.owner?.name ?? "Sin asignar"}
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2">
                                            <span
                                              className={`rounded px-2 py-0.5 text-[10px] font-mono ${
                                                TERMINADO.has(r.status)
                                                  ? "bg-good-bg text-good"
                                                  : "bg-pending-bg text-warning"
                                              }`}
                                            >
                                              {STATUS_LABEL[r.status] ?? r.status}
                                            </span>
                                          </td>
                                          <td className="whitespace-nowrap px-3 py-2 text-muted">
                                            {r.estado ?? "—"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={columnas} className="px-5 py-8 text-center text-sm text-muted">
                    Ningún producto coincide con el filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creandoPara && (
        <div className="fixed inset-0 z-30 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCreandoPara(null)} />
          {/* El mismo marco verde del panel de detalle, para que crear y
              completar una pieza se vean como el mismo momento. */}
          <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded bg-brand-navy">
            <div className="border-b border-white/10 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Nuevo requerimiento</h2>
              <p className="mt-0.5 text-xs text-white/70">
                Para {creandoPara.code} — {creandoPara.name}. Una vez creado se abre solo, para
                cargarle enlaces, métricas y estado en la pauta.
              </p>
            </div>
            <div className="m-4 rounded border border-white/10 bg-surface p-4">
              <RequirementForm
                productoFijo={creandoPara}
                users={users}
                onCreated={(r) => {
                  upsert(r);
                  setCreandoPara(null);
                  // Se abre el detalle recién creado: es donde se sube el resto
                  // de la información, y es el paso siguiente obvio.
                  setDetalleId(r.id);
                }}
                onCancel={() => setCreandoPara(null)}
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
          onClose={() => setDetalleId(null)}
          onUpdated={upsert}
        />
      )}
    </div>
  );
}
