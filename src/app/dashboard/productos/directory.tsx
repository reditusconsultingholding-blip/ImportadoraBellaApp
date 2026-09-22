"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PulseLine, { type PulseTone } from "../pulse-line";
import Link from "next/link";
import {
  ColaDeAprobacion,
  DetalleProducto,
  type Pendiente,
  type Persona,
  type Sugerencia,
} from "../product-actions-panel";

export type DirectoryRow = {
  id: string;
  code: string;
  name: string;
  folder: string | null;
  // Estos seis solo llegan con el permiso de finanzas — ver getDirectory.
  salePrice?: number | null;
  unitCost?: number | null;
  margen?: number | null;
  cpaTarget?: number;
  spend?: number;
  cpa?: number | null;
  cpaTargetProvisional: boolean;
  /** Si tuvo pauta en el período. Dice si corre, no cuánto costó. */
  conPauta: boolean;
  purchases: number;
  score: number;
  state: PulseTone;
  serie: number[];
  motivos: string[];
  sugerencias: Sugerencia[];
  /** Archivado: sigue existiendo, pero fuera de la operación. */
  archived: boolean;
  campanas: number;
  creativos: number;
  creativosEnProduccion: number;
  creativosListosHoy: number;
  creativosVencidos: number;
};

const ESTADO: Record<PulseTone, { texto: string; chip: string }> = {
  SANO: { texto: "Sano", chip: "bg-good-bg text-good border-good/30" },
  VIGILAR: { texto: "Vigilar", chip: "bg-surface-2 text-warning border-warning/30" },
  RIESGO: { texto: "En riesgo", chip: "bg-critical-bg text-critical border-critical/30" },
  SIN_DATOS: { texto: "Sin pauta", chip: "bg-surface-2 text-muted border-border" },
};

type Orden = "pulso" | "gasto" | "nombre" | "creativos" | "margen";

// Ordenar por gasto o por margen no tiene sentido cuando esas columnas no
// existen: el botón quedaría sin efecto visible y parecería roto.
/** En qué anda el producto, que no es lo mismo que cómo le va. */
type Actividad = "pautando" | "activos" | "inactivos" | "todos";

const ACTIVIDADES: { id: Actividad; label: string; ayuda: string }[] = [
  { id: "pautando", label: "Pautando", ayuda: "Gastó en pauta dentro del período elegido." },
  {
    id: "activos",
    label: "Activos sin pauta",
    ayuda: "Se siguen, pero no tuvieron gasto en el período. Están listos para volver a salir.",
  },
  { id: "inactivos", label: "Inactivos", ayuda: "Archivados: fuera de la operación." },
  { id: "todos", label: "Todos", ayuda: "El catálogo entero, archivados incluidos." },
];

function ordenesPara(verCifras: boolean): { id: Orden; label: string }[] {
  return [
    { id: "pulso", label: "Pulso" },
    ...(verCifras
      ? ([
          { id: "gasto", label: "Gasto" },
          { id: "margen", label: "Margen" },
        ] as { id: Orden; label: string }[])
      : []),
    { id: "creativos", label: "Creativos" },
    { id: "nombre", label: "Nombre" },
  ];
}

const money = (n: number | null, dec = 2) =>
  n == null
    ? "—"
    : n.toLocaleString("es-EC", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: dec,
      });

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Directorio de productos.
 *
 * Todo se filtra y ordena en el navegador a propósito: son decenas de filas,
 * no miles, y hacer un viaje al servidor por cada tecla del buscador se
 * sentiría lento sin ninguna ganancia.
 */
export default function ProductDirectory({
  rows,
  periodo,
  carpetas,
  totales,
  puedeGestionar,
  verCifras,
  pendientes,
  equipo,
  puedeDecidir,
}: {
  rows: DirectoryRow[];
  carpetas: string[];
  totales: { productos: number; conPauta: number; sinCosto: number; inactivos: number };
  /** Cómo se llama el período elegido arriba. Los números de abajo son de ahí. */
  periodo: string;
  puedeGestionar: boolean;
  /** Si esta persona ve dinero. Define qué columnas existen. */
  verCifras: boolean;
  pendientes: Pendiente[];
  equipo: Persona[];
  puedeDecidir: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [carpeta, setCarpeta] = useState("");
  const [estado, setEstado] = useState<"" | PulseTone>("");
  const [orden, setOrden] = useState<Orden>("pulso");
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  // En qué anda cada producto. Por defecto, lo que se está pautando: el
  // catálogo tiene más de cien productos y la mitad no tiene una campaña
  // corriendo, así que mezclados había que leer la lista entera para
  // encontrar los veinte con los que se trabaja hoy.
  //
  // "Pautando" es del período elegido arriba: gastó en esos días. Un producto
  // puede estar activo —vivo, sin archivar— y no haber gastado ayer.
  const [actividad, setActividad] = useState<Actividad>("pautando");
  const cuantos = {
    pautando: rows.filter((r) => !r.archived && r.conPauta).length,
    activos: rows.filter((r) => !r.archived && !r.conPauta).length,
    inactivos: rows.filter((r) => r.archived).length,
    todos: rows.length,
  };

  // Proponer y decidir usan la misma API que el panel: el flujo es uno solo,
  // se entre por donde se entre.
  const proponer = (productId: string) => async (s: Sugerencia, cantidad: number) => {
    const res = await fetch("/api/acciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId,
        kind: s.kind,
        detail: s.detail,
        reason: s.reason,
        cantidad,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "No se pudo proponer.");
    }
    router.refresh();
  };

  async function decidir(
    id: string,
    decision: "aprobar" | "rechazar",
    extra: { assigneeId?: string; dueDate?: string; nota?: string }
  ) {
    const res = await fetch("/api/acciones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, decision, ...extra }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "No se pudo guardar.");
    }
    router.refresh();
  }

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    const palabras = q ? q.split(/\s+/) : [];

    const filtradas = rows.filter((r) => {
      // Buscar por nombre o código atraviesa el filtro de actividad: si
      // alguien escribe el nombre, lo está buscando a propósito —incluso si
      // está archivado—.
      if (palabras.length === 0) {
        if (actividad === "pautando" && (r.archived || !r.conPauta)) return false;
        if (actividad === "activos" && (r.archived || r.conPauta)) return false;
        if (actividad === "inactivos" && !r.archived) return false;
      }
      if (carpeta && r.folder !== carpeta) return false;
      if (estado && r.state !== estado) return false;
      if (palabras.length === 0) return true;
      // Se busca por nombre y por código: los media buyers piensan en "134142".
      const heno = plano(`${r.name} ${r.code}`);
      return palabras.every((p) => heno.includes(p));
    });

    const orderBy: Record<Orden, (a: DirectoryRow, b: DirectoryRow) => number> = {
      // Por pulso: primero lo que está en riesgo Y mueve plata. Un producto
      // rojo que gastó cinco dólares no es el problema del día.
      pulso: (a, b) => {
        const rank: Record<PulseTone, number> = {
          RIESGO: 0,
          VIGILAR: 1,
          SANO: 2,
          SIN_DATOS: 3,
        };
        return rank[a.state] - rank[b.state] || (b.spend ?? 0) - (a.spend ?? 0);
      },
      gasto: (a, b) => (b.spend ?? 0) - (a.spend ?? 0),
      margen: (a, b) => (b.margen ?? -Infinity) - (a.margen ?? -Infinity),
      creativos: (a, b) => b.creativos - a.creativos,
      nombre: (a, b) => a.name.localeCompare(b.name, "es"),
    };

    return [...filtradas].sort(orderBy[orden]);
  }, [rows, busqueda, carpeta, estado, orden, actividad]);

  const gastoVisible = visibles.reduce((a, r) => a + (r.spend ?? 0), 0);
  const enRiesgo = visibles.filter((r) => r.state === "RIESGO").length;
  const conPauta = visibles.filter((r) => r.conPauta).length;
  const ORDENES = ordenesPara(verCifras);
  // Ocho columnas cuando se ven las cifras; cinco cuando las cuatro de plata
  // se reemplazan por una sola de compras.
  const columnas = verCifras ? 8 : 5;

  return (
    <div className="flex flex-col gap-4">
      {puedeDecidir && (
        <ColaDeAprobacion pendientes={pendientes} equipo={equipo} onDecidir={decidir} />
      )}

      {/* Filtros: una sola fila arriba de la tabla. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o código…"
            className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {carpetas.length > 0 && (
            <select
              value={carpeta}
              onChange={(e) => setCarpeta(e.target.value)}
              className="rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Todas las carpetas</option>
              {carpetas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* En qué anda: se está pautando ahora, está vivo pero quieto, o
            está archivado. Es la primera pregunta —"¿qué tenemos corriendo?"—
            y antes solo existía como un enlace de texto al pie de la tabla. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
            Estado
          </span>
          {ACTIVIDADES.map((a) => (
            <button
              key={a.id}
              onClick={() => setActividad(a.id)}
              title={a.ayuda}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                actividad === a.id
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {a.label} ({cuantos[a.id]})
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
            Pulso
          </span>
          {(["", "RIESGO", "VIGILAR", "SANO", "SIN_DATOS"] as const).map((e) => (
            <button
              key={e || "todos"}
              onClick={() => setEstado(e)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                estado === e
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {e === "" ? "Todos" : ESTADO[e].texto}
            </button>
          ))}

          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              Ordenar
            </span>
            {ORDENES.map((o) => (
              <button
                key={o.id}
                onClick={() => setOrden(o.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  orden === o.id
                    ? "border-accent bg-good-bg text-accent-strong"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </span>
        </div>

        <p className="text-xs text-muted">
          {visibles.length} de {totales.productos} productos activos ·{" "}
          <span className="font-medium text-foreground">{periodo}</span> ·{" "}
          {/* Cuántos están corriendo en vez de cuánta plata mueven: sirve
              para lo mismo —saber si la lista de abajo es la operación real
              o el catálogo entero— y no dice un monto. */}
          {verCifras ? `${money(gastoVisible, 0)} de pauta` : `${conPauta} con pauta`}
          {enRiesgo > 0 && <span className="text-critical"> · {enRiesgo} en riesgo</span>}
          {verCifras && totales.sinCosto > 0 && puedeGestionar && (
            <span> · {totales.sinCosto} sin costo por artículo cargado</span>
          )}
          {busqueda.trim() && (
            <span> · la búsqueda muestra también los apagados y archivados</span>
          )}
        </p>
      </div>

      {/* La tabla. Se desplaza sola en pantallas angostas. */}
      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="w-full min-w-[52rem] text-sm table-cols">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
              <th className="w-10 px-3 py-2 text-right font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Producto</th>
              <th className="px-3 py-2 font-semibold">Pulso</th>
              {verCifras ? (
                <>
                  <th className="px-3 py-2 text-right font-semibold">Gasto</th>
                  <th className="px-3 py-2 text-right font-semibold">CPA / objetivo</th>
                  <th className="px-3 py-2 text-right font-semibold">Precio / costo</th>
                  <th className="px-3 py-2 text-right font-semibold">Margen</th>
                </>
              ) : (
                <th className="px-3 py-2 text-right font-semibold">Compras</th>
              )}
              <th className="px-3 py-2 text-right font-semibold">Creativos</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={columnas} className="px-3 py-10 text-center text-muted">
                  Ningún producto coincide con eso.
                </td>
              </tr>
            )}

            {visibles.map((r, i) => {
              const excedido =
                r.cpa != null && (r.cpaTarget ?? 0) > 0 && r.cpa > (r.cpaTarget as number);
              const abierto = filaAbierta === r.id;
              return (
                <Fragment key={r.id}>
                <tr
                  className={`border-b border-border last:border-b-0 hover:bg-surface-2 ${
                    abierto ? "bg-surface-2" : ""
                  }`}
                >
                  <td className="px-3 py-2.5 text-right align-top text-xs tabular-nums text-muted">
                    {i + 1}
                  </td>
                  {/* Dos acciones distintas y separadas: la flechita abre el
                      resumen acá mismo y el NOMBRE abre la ficha del producto.
                      Antes todo el bloque desplegaba, y no había forma de
                      adivinar cómo entrar a la ficha. */}
                  <td className="px-3 py-2.5">
                    <span className="flex items-start gap-2">
                      <button
                        onClick={() => setFilaAbierta(abierto ? null : r.id)}
                        aria-expanded={abierto}
                        aria-label={abierto ? `Cerrar el resumen de ${r.name}` : `Ver el resumen de ${r.name}`}
                        title={abierto ? "Cerrar el resumen" : "Ver el resumen acá mismo"}
                        className="mt-1 shrink-0 rounded p-0.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 12 12"
                          fill="none"
                          aria-hidden
                          className={`transition-transform ${abierto ? "rotate-90" : ""}`}
                        >
                          <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                      </button>
                      <span className="min-w-0">
                      <Link
                        href={`/dashboard/productos/${encodeURIComponent(r.code)}`}
                        className="group block font-medium text-foreground hover:text-accent-strong hover:underline"
                        title={`Abrir la ficha de ${r.name}`}
                      >
                        {r.name}
                        <span className="ml-1 text-xs text-muted opacity-0 transition group-hover:opacity-100">
                          abrir ficha →
                        </span>
                      </Link>
                      <span className="block text-xs text-muted">
                        {/* Con los archivados a la vista hace falta decir cuáles
                            lo están: si no, un producto muerto se lee como uno
                            vivo que no gastó. */}
                        {r.archived && (
                          <span className="mr-1 rounded border border-border bg-surface-2 px-1 py-px text-[10px] font-medium">
                            inactivo
                          </span>
                        )}
                        {r.code}
                        {r.folder ? ` · ${r.folder}` : ""}
                        {r.campanas > 0
                          ? ` · ${r.campanas} ${r.campanas === 1 ? "campaña" : "campañas"}`
                          : " · sin campañas"}
                      </span>
                      </span>
                    </span>
                  </td>

                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-2">
                      <PulseLine serie={r.serie} state={r.state} width={48} height={18} />
                      <span
                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ESTADO[r.state].chip}`}
                      >
                        {ESTADO[r.state].texto}
                      </span>
                      {r.state !== "SIN_DATOS" && (
                        <span className="font-mono text-xs tabular-nums text-muted">{r.score}</span>
                      )}
                    </span>
                  </td>

                  {verCifras ? (
                    <>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {(r.spend ?? 0) > 0 ? money(r.spend ?? null, 0) : "—"}
                        {r.purchases > 0 && (
                          <span className="block text-xs text-muted">{r.purchases} compras</span>
                        )}
                      </td>

                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className={excedido ? "text-critical" : undefined}>
                          {r.cpa == null ? "—" : money(r.cpa)}
                        </span>
                        <span className="block text-xs text-muted">
                          obj {money(r.cpaTarget ?? null)}
                          {r.cpaTargetProvisional && (
                            <span
                              className="text-warning"
                              title="El objetivo se puso sin conocer el costo real del producto: revísalo"
                            >
                              {" · provisional"}
                            </span>
                          )}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {money(r.salePrice ?? null)}
                        <span className="block text-xs text-muted">
                          costo {money(r.unitCost ?? null)}
                        </span>
                      </td>

                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {money(r.margen ?? null)}
                      </td>
                    </>
                  ) : (
                    // Las compras atribuidas ocupan el lugar de las cuatro
                    // columnas de plata: es la medida de volumen que sí
                    // corresponde ver, y deja la tabla sin huecos.
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {r.purchases > 0 ? r.purchases.toLocaleString("es-EC") : "—"}
                      {r.conPauta && r.purchases === 0 && (
                        <span className="block text-xs text-warning">con pauta, sin compras</span>
                      )}
                    </td>
                  )}

                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {r.creativos === 0 ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <>
                        {r.creativos}
                        <span className="block text-xs text-muted">
                          {r.creativosEnProduccion > 0 && `${r.creativosEnProduccion} en curso`}
                          {r.creativosListosHoy > 0 && (
                            <span className="text-good">
                              {r.creativosEnProduccion > 0 ? " · " : ""}
                              {r.creativosListosHoy} hoy
                            </span>
                          )}
                          {r.creativosVencidos > 0 && (
                            <span className="text-critical"> · {r.creativosVencidos} vencidos</span>
                          )}
                        </span>
                      </>
                    )}
                  </td>
                </tr>

                {abierto && (
                  <tr className="border-b border-border last:border-b-0">
                    <td colSpan={columnas} className="p-0">
                      <DetalleProducto
                        p={{
                          productId: r.id,
                          code: r.code,
                          name: r.name,
                          score: r.score,
                          state: r.state,
                          spend: r.spend,
                          purchases: r.purchases,
                          cpa: r.cpa,
                          cpaTarget: r.cpaTarget,
                          salePrice: r.salePrice,
                          unitCost: r.unitCost,
                          serie: r.serie,
                          motivos: r.motivos,
                          sugerencias: r.sugerencias,
                        }}
                        verCifras={verCifras}
                        onProponer={proponer(r.id)}
                        onCerrar={() => setFilaAbierta(null)}
                        puedeConfigurar={puedeGestionar}
                        onCambio={() => router.refresh()}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
