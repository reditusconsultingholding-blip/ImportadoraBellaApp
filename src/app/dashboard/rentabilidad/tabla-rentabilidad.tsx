"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FilaRentabilidad, Rentabilidad } from "@/lib/rentabilidad";

const money = (n: number | null, dec = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("es-EC", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: dec,
      });

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

const plano = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Filtro = "todos" | "pierden" | "ganan" | "sin-economia";

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pierden", label: "Pierden plata" },
  { id: "ganan", label: "Dejan utilidad" },
  { id: "sin-economia", label: "Sin economía cargada" },
];

/**
 * Rentabilidad por producto.
 *
 * La cuenta no es precio menos costo. En contraentrega, de cada compra que la
 * pauta se atribuye solo una parte se confirma, y de esa parte una porción se
 * devuelve — pero el flete ya se pagó. Un producto con 90% de margen bruto y
 * 30% de efectividad pierde plata en cada venta, y esa es exactamente la clase
 * de producto que un tablero común muestra en verde.
 */
export default function TablaRentabilidad({ data }: { data: Rentabilidad }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abierta, setAbierta] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const q = plano(busqueda.trim());
    return data.filas.filter((f) => {
      if (q && !plano(`${f.name} ${f.code}`).includes(q)) return false;
      if (filtro === "pierden") return f.utilidad != null && f.utilidad < 0;
      if (filtro === "ganan") return f.utilidad != null && f.utilidad > 0;
      if (filtro === "sin-economia") return !f.tieneEconomia;
      return true;
    });
  }, [data.filas, busqueda, filtro]);

  const pierden = data.filas.filter((f) => f.utilidad != null && f.utilidad < 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Gasto en pauta", valor: money(data.totales.gastoPauta) },
          { label: "Ingreso estimado", valor: money(data.totales.ingreso) },
          {
            label: "Utilidad estimada",
            valor: money(data.totales.utilidad),
            tono: data.totales.utilidad >= 0 ? "text-good" : "text-critical",
          },
          {
            label: "Productos que pierden",
            valor: String(pierden.length),
            tono: pierden.length > 0 ? "text-critical" : undefined,
          },
        ].map((t) => (
          <div key={t.label} className="rounded border border-border bg-surface p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              {t.label}
            </p>
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${t.tono ?? ""}`}>{t.valor}</p>
          </div>
        ))}
      </div>

      {/* De dónde salen estos números y qué tan lejos están de la realidad. */}
      <div className="rounded border border-border bg-surface px-4 py-3 text-xs text-muted">
        <p>
          La utilidad se calcula sobre las <strong>compras que se atribuye la pauta</strong>,
          aplicando la efectividad y las devoluciones reales de cada producto. En el mismo período,
          Shopify registró{" "}
          <strong className="text-foreground">
            {data.contraste.ordenesShopify.toLocaleString("es-EC")} órdenes
          </strong>{" "}
          por {money(data.contraste.facturadoShopify)}
          {data.contraste.vecesAtribuido != null && data.contraste.vecesAtribuido > 1.2 && (
            <>
              , mientras las plataformas se atribuyen{" "}
              <strong className="text-warning">
                {data.contraste.vecesAtribuido.toFixed(1)} veces más
              </strong>
              . Es normal que se solapen, pero significa que la utilidad de abajo está por encima de
              la real en aproximadamente esa proporción
            </>
          )}
          .
        </p>
        {data.totales.sinEconomia > 0 && (
          <p className="mt-1.5">
            {data.totales.sinEconomia}{" "}
            {data.totales.sinEconomia === 1 ? "producto no tiene" : "productos no tienen"} su
            economía cargada (precio, costo, flete, efectividad), así que de{" "}
            {data.totales.sinEconomia === 1 ? "ese no" : "esos no"} se puede calcular utilidad.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                filtro === f.id
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="table-cols w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
              <th className="w-10 px-3 py-2 text-right font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Producto</th>
              <th className="px-3 py-2 text-right font-semibold">Gasto</th>
              <th className="px-3 py-2 text-right font-semibold">CPA / equilibrio</th>
              <th className="px-3 py-2 text-right font-semibold">Efectividad</th>
              <th className="px-3 py-2 text-right font-semibold">Ingreso</th>
              <th className="px-3 py-2 text-right font-semibold">Utilidad</th>
              <th className="px-3 py-2 text-right font-semibold">Margen</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-muted">
                  Ningún producto coincide con eso.
                </td>
              </tr>
            )}

            {visibles.map((f, i) => (
              <Fila
                key={f.productId}
                fila={f}
                indice={i + 1}
                abierta={abierta === f.productId}
                onAbrir={() => setAbierta(abierta === f.productId ? null : f.productId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Fila({
  fila: f,
  indice,
  abierta,
  onAbrir,
}: {
  fila: FilaRentabilidad;
  indice: number;
  abierta: boolean;
  onAbrir: () => void;
}) {
  const pierde = f.utilidad != null && f.utilidad < 0;
  const sobreObjetivo = f.cpa != null && f.cpaBreakeven != null && f.cpa > f.cpaBreakeven;

  return (
    <>
      <tr className={`border-b border-border last:border-b-0 hover:bg-surface-2 ${abierta ? "bg-surface-2" : ""}`}>
        <td className="px-3 py-2.5 text-right align-top text-xs tabular-nums text-muted">{indice}</td>
        <td className="px-3 py-2.5">
          <button onClick={onAbrir} className="flex w-full items-center gap-2 text-left">
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden
              className={`shrink-0 text-muted transition-transform ${abierta ? "rotate-90" : ""}`}
            >
              <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="min-w-0">
              <span className="block truncate font-medium">{f.name}</span>
              <span className="block text-xs text-muted">
                {f.code}
                {!f.tieneEconomia && (
                  <span className="text-warning"> · sin economía cargada</span>
                )}
              </span>
            </span>
          </button>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          {money(f.gastoPauta)}
          <span className="block text-xs text-muted">{f.comprasAtribuidas} compras</span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          <span className={sobreObjetivo ? "text-critical" : undefined}>{money(f.cpa, 2)}</span>
          <span className="block text-xs text-muted">
            {f.cpaBreakeven == null ? "—" : `equilibrio ${money(f.cpaBreakeven, 2)}`}
          </span>
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">
          {pct(f.efectividad)}
          {f.devoluciones != null && f.devoluciones > 0 && (
            <span className="block text-xs text-muted">{pct(f.devoluciones)} devueltas</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{money(f.ingreso)}</td>
        <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${pierde ? "text-critical" : f.utilidad != null ? "text-good" : ""}`}>
          {money(f.utilidad)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{pct(f.margen)}</td>
      </tr>

      {abierta && (
        <tr className="border-b border-border last:border-b-0">
          <td colSpan={8} className="bg-surface-2/40 px-4 py-3">
            {f.tieneEconomia ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted">
                  De {f.comprasAtribuidas} compras atribuidas se cobran{" "}
                  <strong className="text-foreground">
                    {Math.round(f.entregados ?? 0).toLocaleString("es-EC")}
                  </strong>{" "}
                  ({pct(f.efectividad)} se confirma
                  {f.devoluciones != null && f.devoluciones > 0
                    ? `, y de esas vuelve el ${pct(f.devoluciones)}`
                    : ""}
                  ).
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  {[
                    { l: "Ingreso", v: money(f.ingreso) },
                    { l: "Mercadería", v: `− ${money(f.costoMercaderia)}` },
                    { l: "Flete", v: `− ${money(f.costoFlete)}` },
                    { l: "Pauta", v: `− ${money(f.gastoPauta)}` },
                  ].map((d) => (
                    <div key={d.l}>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                        {d.l}
                      </p>
                      <p className="tabular-nums">{d.v}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted">
                  El flete se paga sobre todo lo despachado, se devuelva o no — por eso va sobre{" "}
                  {Math.round(f.comprasAtribuidas * (f.efectividad ?? 0)).toLocaleString("es-EC")}{" "}
                  paquetes y no sobre los entregados.
                </p>
                {f.economiaDe && <p className="text-[11px] text-muted">{f.economiaDe}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted">
                Este producto no tiene cargados precio, costo, flete y efectividad, así que no se
                puede calcular su utilidad.{" "}
                <Link
                  href={`/dashboard/productos/${encodeURIComponent(f.code)}`}
                  className="underline underline-offset-2"
                >
                  Cargarlos en su ficha
                </Link>
                .
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
