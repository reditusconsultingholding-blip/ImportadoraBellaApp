"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FilaVisible } from "@/lib/metrics";

// Las campañas que están corriendo, dentro del pipeline.
//
// Los números NO se vuelven a calcular acá: llegan de getOverview, la misma
// función que alimenta el panel. Si el pipeline mostrara otro gasto que el
// panel para la misma campaña, no habría forma de saber cuál creer, y la
// respuesta más probable sería "ninguno de los dos".
//
// "Activa" quiere decir que gastó dentro del período. No es el estado que
// devuelve la plataforma: una campaña puede figurar como ACTIVE y llevar dos
// semanas sin entregar una impresión, y esa no es la que hay que mirar.
//
// Las filas vienen recortadas del servidor (`filasVisibles`): sin el permiso
// de finanzas no traen gasto, ingreso, CPA ni objetivo. `activa` existe justo
// por eso — antes se deducía con `spend > 0`, que obligaba a mandar el gasto
// para poder filtrar.

const ESTADO_FILA = {
  sano: { texto: "Va bien", chip: "bg-good-bg text-good" },
  vigilar: { texto: "Optimizar", chip: "bg-surface-2 text-warning" },
  riesgo: { texto: "Va mal", chip: "bg-critical-bg text-critical" },
  "sin-objetivo": { texto: "Sin producto", chip: "bg-surface-2 text-muted" },
} as const;

const money = (n: number) =>
  n.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const money2 = (n: number) =>
  n.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

const entero = (n: number) => n.toLocaleString("es-EC");

const plano = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Filtro = "todas" | "sano" | "vigilar" | "riesgo" | "mejores" | "peores";

// Las mismas palabras que usa el panel para lo mismo. Dos vocabularios para
// un solo semáforo obligan a traducir mentalmente en cada pantalla.
const FILTROS: { id: Filtro; label: string; ayuda: string }[] = [
  { id: "todas", label: "Todas", ayuda: "Las que gastaron en el período" },
  {
    id: "peores",
    label: "Las peores",
    ayuda: "Las que más se pasan de su CPA objetivo",
  },
  {
    id: "mejores",
    label: "Las mejores",
    ayuda: "Las que más lejos están de su techo de CPA",
  },
  { id: "riesgo", label: "Van mal", ayuda: "Piden una decisión hoy" },
  { id: "vigilar", label: "Optimizar", ayuda: "Se están acercando al límite" },
  { id: "sano", label: "Van bien", ayuda: "Pagan menos de lo que pueden" },
];

type Plataforma = "META" | "TIKTOK";

const PLATAFORMAS: { id: Plataforma; label: string }[] = [
  { id: "META", label: "Meta" },
  { id: "TIKTOK", label: "TikTok" },
];

export type CampanasDePlataforma = {
  filas: FilaVisible[];
  /** Cuántas campañas todavía no están asociadas a un producto. */
  sinProducto: number;
};

export default function CampanasActivas({
  meta,
  tiktok,
  periodo,
  verCifras,
}: {
  meta: CampanasDePlataforma;
  tiktok: CampanasDePlataforma;
  periodo: string;
  /** Si esta persona ve dinero. Define qué columnas existen. */
  verCifras: boolean;
}) {
  const [plataforma, setPlataforma] = useState<Plataforma>("META");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const overview = plataforma === "META" ? meta : tiktok;

  const visibles = useMemo(() => {
    // Sin gasto no está corriendo: la fila existe porque la campaña tiene
    // métricas del período, no porque esté entregando hoy.
    const activas = overview.filas.filter((r) => r.activa);
    const q = plano(busqueda.trim());

    const porTexto = activas.filter(
      (r) =>
        !q ||
        plano(r.name).includes(q) ||
        (r.code != null && plano(r.code).includes(q)),
    );

    if (filtro === "todas") return porTexto;
    if (filtro === "sano" || filtro === "vigilar" || filtro === "riesgo") {
      return porTexto.filter((r) => r.status === filtro);
    }

    // Mejores y peores se ordenan por CUÁNTO SE ALEJAN DEL OBJETIVO, no por
    // gasto: una campaña que gasta $2.000 a la mitad de su objetivo no es un
    // problema, y una que gasta $200 al doble sí. Además así el orden es el
    // mismo vea o no vea cifras quien mira.
    const conObjetivo = porTexto.filter((r) => r.desvio != null);
    return [...conObjetivo].sort((a, b) =>
      filtro === "peores" ? b.desvio! - a.desvio! : a.desvio! - b.desvio!,
    );
  }, [overview.filas, busqueda, filtro]);

  const activas = overview.filas.filter((r) => r.activa);
  const gastoVisible = visibles.reduce((s, r) => s + (r.spend ?? 0), 0);
  const columnas = verCifras ? 8 : 7;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {PLATAFORMAS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlataforma(p.id)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                plataforma === p.id
                  ? "bg-surface text-foreground shadow-[0_1px_2px_0_rgb(26_26_26_/_0.08)]"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar campaña o código…"
          className="min-w-[200px] rounded border border-border bg-transparent px-3 py-1.5 text-xs outline-none focus:border-accent"
        />

        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            title={f.ayuda}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              filtro === f.id
                ? "border-accent bg-good-bg text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}

        <span className="ml-auto text-xs text-muted">
          {visibles.length} de {activas.length}
          {verCifras ? ` · ${money(gastoVisible)}` : " corriendo"}
        </span>
      </div>

      {/* Qué significa el filtro elegido, escrito. El nombre corto del chip
          entra en el ancho, pero "Las peores" no dice contra qué. */}
      {filtro !== "todas" && (
        <p className="-mt-2 text-xs text-muted">
          {FILTROS.find((f) => f.id === filtro)?.ayuda}
          {(filtro === "mejores" || filtro === "peores") &&
            " · las que no tienen objetivo cargado quedan fuera: no se pueden juzgar"}
        </p>
      )}
      <p className="rounded border border-border bg-surface px-4 py-2.5 text-xs text-muted">
        {periodo}. Las compras{verCifras ? " y el ingreso son las" : " son las"}{" "}
        que se ATRIBUYE {plataforma === "META" ? "Meta" : "TikTok"}, no las
        órdenes que se cobraron: suelen ser bastantes más, porque las dos
        plataformas se cuelgan la misma venta.
      </p>

      <div className="overflow-hidden rounded border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-5 py-3">Producto / campaña</th>
                {verCifras ? (
                  <th className="px-5 py-3 text-right">Gasto</th>
                ) : (
                  <>
                    <th className="px-5 py-3 text-right">Impresiones</th>
                    <th className="px-5 py-3 text-right">CTR</th>
                  </>
                )}
                <th className="px-5 py-3 text-right">Compras</th>
                {verCifras && (
                  <>
                    <th className="px-5 py-3 text-right">Ingreso</th>
                    <th className="px-5 py-3 text-right">CPA</th>
                    <th className="px-5 py-3 text-right">Objetivo</th>
                  </>
                )}
                <th className="px-5 py-3 text-right">vs. objetivo</th>
                <th className="px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((r) => {
                const z = r.desvio;
                return (
                  <tr key={r.key} className="border-t border-border">
                    <td className="px-5 py-3">
                      {r.code ? (
                        <Link
                          href={`/dashboard/productos/${encodeURIComponent(r.code)}`}
                          className="font-medium hover:text-accent hover:underline"
                        >
                          {r.name}
                        </Link>
                      ) : (
                        <p className="font-medium leading-snug">{r.name}</p>
                      )}
                      <p className="font-mono text-xs text-muted">
                        {r.code ?? "campaña sin producto asociado"}
                      </p>
                    </td>
                    {verCifras ? (
                      <td className="px-5 py-3 text-right tabular-nums">
                        {money2(r.spend ?? 0)}
                      </td>
                    ) : (
                      <>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {entero(r.impressions)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {r.ctr == null ? (
                            <span className="text-muted">—</span>
                          ) : (
                            `${r.ctr.toFixed(2)}%`
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-5 py-3 text-right tabular-nums">
                      {r.purchases}
                    </td>
                    {verCifras && (
                      <>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {money2(r.revenue ?? 0)}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums">
                          {r.cpa != null ? money2(r.cpa) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right tabular-nums text-muted">
                          {r.cpaTarget != null ? money2(r.cpaTarget) : "—"}
                        </td>
                      </>
                    )}
                    <td className="px-5 py-3 text-right tabular-nums">
                      {z == null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span
                          className={
                            z > 1.15
                              ? "text-critical"
                              : z > 1
                                ? "text-warning"
                                : "text-good"
                          }
                        >
                          {z >= 1 ? "+" : "−"}
                          {Math.abs(Math.round((z - 1) * 100))}%
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-xs ${ESTADO_FILA[r.status].chip}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {ESTADO_FILA[r.status].texto}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && (
                <tr>
                  <td
                    colSpan={columnas}
                    className="px-5 py-8 text-center text-sm text-muted"
                  >
                    {activas.length === 0
                      ? "Ninguna campaña de esta plataforma estuvo corriendo en el período."
                      : filtro === "riesgo"
                        ? "Ninguna campaña de esta plataforma se está pasando de su objetivo. Es una buena noticia."
                        : "Ninguna campaña coincide con el filtro."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {overview.sinProducto > 0 && (
        <p className="rounded border border-border bg-pending-bg px-3 py-2 text-xs text-warning">
          {overview.sinProducto} campañas de esta plataforma todavía no están
          asociadas a un producto, así que aparecen sueltas y sin semáforo. Se
          enlazan solas por el código que llevan en el nombre, apenas el
          producto exista en{" "}
          <Link href="/dashboard/productos" className="underline">
            Productos
          </Link>
          .
        </p>
      )}
    </div>
  );
}
