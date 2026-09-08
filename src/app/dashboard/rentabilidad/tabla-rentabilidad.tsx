"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FilaRentabilidad, Rentabilidad } from "@/lib/rentabilidad";
import { semaforoDeFila } from "@/lib/rentabilidad-semaforo";

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

  const pierden = data.filas.filter((f) => {
    const u = f.real?.utilidad ?? f.utilidad;
    return u != null && u < 0;
  });

  // Cuánto de lo que cobró la tienda sabemos a qué producto pertenece.
  //
  // Es el número que decide qué se muestra arriba. Con cero enlaces cargados,
  // lo único que se puede decir es lo que la pauta se atribuye —y hay que
  // decirlo, no disimularlo—; a partir de ahí manda la venta real.
  const cobertura = data.contraste.coberturaEnlaces;
  const hayReal = data.totalesReales.facturado > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* El resumen del período.
          Faltaba lo facturado en Shopify: las otras tres cifras salen de las
          compras que se atribuye la pauta, y sin el número real al lado no hay
          forma de saber qué tan lejos están. Estaba escrito en el párrafo de
          abajo, en letra chica, donde nadie lo leía. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Resumen
          label="Facturado en Shopify"
          valor={money(data.contraste.facturadoShopify)}
          nota={`${data.contraste.ordenesShopify.toLocaleString("es-EC")} órdenes reales`}
        />
        <Resumen
          label="Gasto en pauta"
          valor={money(data.totales.gastoPauta)}
          nota="Meta y TikTok en el período"
        />
        <Resumen
          label={hayReal ? "Ingreso cobrado estimado" : "Ingreso estimado"}
          valor={money(hayReal ? data.totalesReales.ingreso : data.totales.ingreso)}
          nota={
            hayReal
              ? `de ${money(data.totalesReales.facturado)} vendidos, tras cancelaciones y devoluciones`
              : `sobre ${data.totales.comprasAtribuidas.toLocaleString("es-EC")} compras atribuidas`
          }
        />
        <Resumen
          label="Utilidad estimada"
          valor={money(hayReal ? data.totalesReales.utilidad : data.totales.utilidad)}
          nota={
            pierden.length > 0
              ? `${pierden.length} ${pierden.length === 1 ? "producto pierde" : "productos pierden"} plata`
              : "tras mercadería, flete y pauta"
          }
          tono={
            (hayReal ? data.totalesReales.utilidad : data.totales.utilidad) >= 0
              ? "text-good"
              : "text-critical"
          }
        />
      </div>

      {/* Sobre qué base están calculados estos números, y cuánto falta para
          que describan el negocio entero. Antes decía siempre "sobre las
          compras que se atribuye la pauta", que en esta tienda es el 17% de las
          órdenes: la explicación estaba, pero enterrada bajo cuatro cifras que
          parecían del mismo tamaño que las de Shopify. */}
      <div className="rounded border border-border bg-surface px-4 py-3 text-xs text-muted">
        {hayReal ? (
          <p>
            La utilidad sale de lo que la tienda <strong>vendió de verdad</strong> —{" "}
            <strong className="text-foreground">
              {money(data.totalesReales.facturado)}
            </strong>{" "}
            en {data.totalesReales.unidades.toLocaleString("es-EC")} unidades de{" "}
            {data.totalesReales.productos.toLocaleString("es-EC")} productos — aplicando la
            efectividad y las devoluciones de cada uno y descontando la pauta.{" "}
            {cobertura < 0.99 ? (
              <>
                Se reconoce el{" "}
                <strong className={cobertura >= 0.8 ? "text-foreground" : "text-warning"}>
                  {Math.round(cobertura * 100)}%
                </strong>{" "}
                de lo facturado; el resto son ventas cuyo nombre en Shopify todavía no está enlazado
                a ningún producto.{" "}
                <a href="/dashboard/sin-nomenclatura" className="underline">
                  Enlazarlas
                </a>
                .
              </>
            ) : (
              "Está reconocida toda la facturación del período."
            )}
          </p>
        ) : (
          <p>
            La utilidad se calcula sobre las <strong>compras que se atribuye la pauta</strong>, que
            en este período son{" "}
            <strong className="text-foreground">
              {data.totales.comprasAtribuidas.toLocaleString("es-EC")}
            </strong>{" "}
            contra{" "}
            <strong className="text-foreground">
              {data.contraste.ordenesShopify.toLocaleString("es-EC")} órdenes
            </strong>{" "}
            reales por {money(data.contraste.facturadoShopify)}. Por eso el ingreso de arriba es
            mucho más chico que lo facturado: describe solo lo que los anuncios se cuelgan.{" "}
            <a href="/dashboard/sin-nomenclatura" className="underline">
              Enlazá los productos con Shopify
            </a>{" "}
            y pasa a calcularse sobre la venta real.
          </p>
        )}
        {data.contraste.vecesAtribuido != null && data.contraste.vecesAtribuido > 1.2 && (
          <p className="mt-1.5">
            Meta y TikTok juntos se atribuyen{" "}
            <strong className="text-warning">
              {data.contraste.vecesAtribuido.toFixed(1)} veces
            </strong>{" "}
            las órdenes que entraron. Es normal que se solapen —la misma venta la cuentan las dos—,
            y por eso conviene decidir con la columna de lo vendido.
          </p>
        )}
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
              <th className="px-3 py-2 text-right font-semibold">Vendido</th>
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
                <td colSpan={9} className="px-3 py-10 text-center text-muted">
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

/** Una tarjeta del resumen. Mismo aire que las del Panel. */
function Resumen({
  label,
  valor,
  nota,
  tono,
}: {
  label: string;
  valor: string;
  nota?: string;
  tono?: string;
}) {
  return (
    <div className="rounded border border-border bg-surface p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</p>
      <p className={`mt-1 text-xl font-semibold leading-none tabular-nums ${tono ?? ""}`}>{valor}</p>
      {nota && <p className="mt-1.5 text-[11px] leading-snug text-muted">{nota}</p>}
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
  // Lo que se muestra en Ingreso, Utilidad y Margen.
  //
  // Cuando el producto está enlazado con su nombre de Shopify, mandan los
  // números de la venta real; si no, quedan los de la pauta, que es lo único
  // que se sabe. La fila dice cuál de los dos está mirando: dos productos con
  // la utilidad calculada sobre bases distintas, en la misma columna y sin
  // avisar, no se pueden comparar entre sí.
  const r = f.real;
  const ingresoVis = r?.ingreso ?? f.ingreso;
  const utilidadVis = r?.utilidad ?? f.utilidad;
  const margenVis = r?.margen ?? f.margen;

  const pierde = utilidadVis != null && utilidadVis < 0;
  const sobreObjetivo = f.cpa != null && f.cpaBreakeven != null && f.cpa > f.cpaBreakeven;

  // El semáforo de la fila. Tintes muy suaves a propósito: tienen que dejarse
  // barrer con la vista para encontrar lo que necesita atención, sin que la
  // tabla se vuelva ilegible ni compita con los números.
  //
  // Al abrir la fila gana el gris del detalle: dos fondos de color encimados
  // hacen perder de vista cuál está abierta.
  const semaforo = semaforoDeFila(f);
  const fondo = abierta
    ? "bg-surface-2"
    : semaforo === "mal"
      ? "bg-critical-bg"
      : semaforo === "medio"
        ? "bg-pending-bg"
        : semaforo === "bien"
          ? "bg-good-bg"
          : "";

  return (
    <>
      <tr className={`border-b border-border transition-colors last:border-b-0 hover:bg-surface-2 ${fondo}`}>
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
          {r == null ? (
            <span className="text-muted">—</span>
          ) : (
            <>
              {money(r.facturado)}
              <span className="block text-xs text-muted">
                {r.unidades.toLocaleString("es-EC")} unidades
              </span>
            </>
          )}
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
        <td className="px-3 py-2.5 text-right tabular-nums">
          {money(ingresoVis)}
          {r == null && f.ingreso != null && (
            <span className="block text-xs text-muted">atribuido</span>
          )}
        </td>
        <td className={`px-3 py-2.5 text-right font-medium tabular-nums ${pierde ? "text-critical" : utilidadVis != null ? "text-good" : ""}`}>
          {money(utilidadVis)}
        </td>
        <td className="px-3 py-2.5 text-right tabular-nums">{pct(margenVis)}</td>
      </tr>

      {abierta && (
        <tr className="border-b border-border last:border-b-0">
          <td colSpan={9} className="bg-surface-2/40 px-4 py-3">
            {f.tieneEconomia ? (
              <div className="flex flex-col gap-2">
                {r != null && (
                  <p className="text-xs text-muted">
                    La tienda vendió{" "}
                    <strong className="text-foreground">
                      {r.unidades.toLocaleString("es-EC")} unidades
                    </strong>{" "}
                    por {money(r.facturado)}; de esas se cobran{" "}
                    <strong className="text-foreground">
                      {Math.round(r.entregadas).toLocaleString("es-EC")}
                    </strong>
                    , y lo que queda después de mercadería, flete y pauta es{" "}
                    <strong className={r.utilidad >= 0 ? "text-good" : "text-critical"}>
                      {money(r.utilidad)}
                    </strong>
                    .
                  </p>
                )}
                <p className="text-xs text-muted">
                  {r != null ? "Según la pauta: de " : "De "}
                  {f.comprasAtribuidas} compras atribuidas se cobran{" "}
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
