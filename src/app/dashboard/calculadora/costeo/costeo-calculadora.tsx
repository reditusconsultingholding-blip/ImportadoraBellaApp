"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calcularCosteo,
  COSTEO_POR_DEFECTO,
  type EntradaCosteo,
  type ResultadoCosteo,
} from "@/lib/costeo";

// La calculadora de costos, en oscuro y en cinco pasos.
//
// POR QUÉ ESTE ASPECTO
// Es una pantalla donde alguien decide si sube o baja el presupuesto de
// publicidad con plata real. El fondo oscuro y las líneas finas no son
// decoración: bajan el ruido para que los cuatro números que deciden —utilidad
// del día, CPA efectivo, ROAS y confirmación de equilibrio— se lean de un
// vistazo y sin competencia. Todo lo demás está en gris.
//
// POR QUÉ SE GUARDA SOLO
// Porque nadie vuelve a teclear el flete y la tasa de confirmación de un
// producto cada vez que lo mira, y si tuviera que hacerlo terminaría
// calculando con valores inventados. Los ajustes son de la organización, no de
// la persona: si cada uno guardara los suyos, dos personas discutirían sobre el
// mismo producto con números distintos sin enterarse.
//
// SOBRE LAS CUENTAS
// No hay fórmulas nuevas acá. Todo sale de `lib/costeo.ts`, que es el mismo
// motor que usa el resto de la app. Lo que esta pantalla agrega es la forma de
// preguntar —por embudo: checkouts, confirmación, devolución— y la de mostrar.

type ProductoShopify = { id: string; titulo: string; precio: number | null; costo: number | null };

export type FichaCalculadora = {
  code: string;
  name: string;
  salePrice: number | null;
  unitCost: number | null;
  flete: number | null;
  efectividad: number | null;
  devoluciones: number | null;
  cpaTarget: number | null;
};

type Valores = {
  precio: number;
  costoProducto: number;
  flete: number;
  cpa: number;
  gastoAdm: number;
  /** Porcentaje de los checkouts que se confirma. */
  confirmacion: number;
  /** Porcentaje de lo DESPACHADO que vuelve. Es como lo reporta la transportadora. */
  devolucion: number;
  checkouts: number;
  /** Cuánto se quiere ganar por pedido, en % del precio. Para el CPA ideal. */
  utilidadDeseada: number;
};

const POR_DEFECTO: Valores = {
  precio: 24.99,
  costoProducto: 6,
  flete: 8.5,
  cpa: 3,
  gastoAdm: 4,
  confirmacion: 70,
  devolucion: 15,
  checkouts: 150,
  utilidadDeseada: 20,
};

/* ------------------------------- Las cuentas ------------------------------ */

/**
 * Del embudo al modelo de costeo.
 *
 * La única traducción delicada: acá la devolución se teclea sobre lo
 * DESPACHADO —así la reporta la transportadora— y el modelo la quiere sobre los
 * checkouts. Pasarla tal cual inflaría la pérdida de todo producto con
 * confirmación baja.
 */
function aEntrada(v: Valores): EntradaCosteo {
  return {
    ...COSTEO_POR_DEFECTO,
    pvp: v.precio,
    costoProducto: v.costoProducto,
    fletePromedio: v.flete,
    pedidosDia: v.checkouts,
    pctCancelacion: 100 - v.confirmacion,
    pctDevolucion: (v.confirmacion / 100) * v.devolucion,
    cpaActual: v.cpa,
    gastoAdmPorEntregado: v.gastoAdm,
    diasMes: 30,
  };
}

type Lectura = {
  r: ResultadoCosteo;
  entregadas: number;
  utilidadDia: number;
  utilidadPedido: number;
  inversionAds: number;
  cpaEfectivo: number;
  roas: number;
  cpaBreakeven: number;
  cpaIdeal: number;
  /** A qué tasa de confirmación la utilidad del día llega a cero. */
  confirmacionEquilibrio: number;
};

function leer(v: Valores): Lectura {
  const r = calcularCosteo(aEntrada(v));
  const entregadas = r.dia.entregados;
  const utilidadDia = r.pauta.utilidadConPautaReal;
  const inversionAds = r.pauta.pautaReal;

  // El CPA por checkout al que cada pedido entregado dejaría exactamente la
  // utilidad deseada. Sale de despejar, no de tantear.
  const objetivoPorPedido = (v.utilidadDeseada / 100) * v.precio;
  const cpaIdeal =
    v.checkouts > 0
      ? (r.dia.margenBrutoReal - objetivoPorPedido * entregadas) / v.checkouts
      : 0;

  return {
    r,
    entregadas,
    utilidadDia,
    utilidadPedido: entregadas > 0 ? utilidadDia / entregadas : 0,
    inversionAds,
    cpaEfectivo: entregadas > 0 ? inversionAds / entregadas : 0,
    roas: inversionAds > 0 ? r.dia.ingresoEntregado / inversionAds : 0,
    cpaBreakeven: r.pauta.cpaEquilibrio,
    cpaIdeal,
    confirmacionEquilibrio: buscarConfirmacionEquilibrio(v),
  };
}

/**
 * A qué tasa de confirmación se deja de ganar, con todo lo demás igual.
 *
 * Por búsqueda binaria y no por despeje: la confirmación entra en el flete
 * (que se paga sobre lo despachado), en las devoluciones y en los entregados a
 * la vez, así que la ecuación no se despeja limpio. Treinta pasadas dan una
 * precisión de milésimas y cuestan nada.
 */
function buscarConfirmacionEquilibrio(v: Valores): number {
  const utilidadCon = (c: number) => calcularCosteo(aEntrada({ ...v, confirmacion: c })).pauta.utilidadConPautaReal;
  if (utilidadCon(100) <= 0) return 100;
  if (utilidadCon(0) >= 0) return 0;
  let bajo = 0;
  let alto = 100;
  for (let i = 0; i < 30; i++) {
    const medio = (bajo + alto) / 2;
    if (utilidadCon(medio) >= 0) alto = medio;
    else bajo = medio;
  }
  return alto;
}

/* --------------------------------- Formato -------------------------------- */

const usd = (n: number, dec = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: dec, minimumFractionDigits: dec })
    : "—";
const usd0 = (n: number) => usd(n, 0);
const dec1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—");
const pctTxt = (n: number, d = 0) => (Number.isFinite(n) ? `${n.toFixed(d)}%` : "—");

/* ------------------------------ Piezas sueltas ---------------------------- */

function Seccion({
  n,
  titulo,
  nota,
  children,
}: {
  n: number;
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 md:p-5">
      <div className="mb-4 flex items-baseline gap-2.5">
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border border-good-claro/50 bg-good-claro/15 text-[10px] font-semibold tabular-nums text-good-claro">
          {n}
        </span>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
          {titulo}
        </h2>
        {nota && <span className="text-[11px] text-white/35">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function Campo({
  etiqueta,
  ayuda,
  valor,
  onChange,
  prefijo,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: number;
  onChange: (v: number) => void;
  prefijo?: string;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const texto = borrador ?? String(valor).replace(".", ",");

  return (
    <label className="block">
      <span className="block text-[11px] leading-tight text-white/55">{etiqueta}</span>
      {ayuda && <span className="block text-[10px] leading-tight text-white/30">{ayuda}</span>}
      <span className="mt-1.5 flex items-center rounded border border-white/12 bg-black/25 transition focus-within:border-good-claro/70">
        {prefijo && <span className="pl-2.5 text-xs text-white/35">{prefijo}</span>}
        <input
          inputMode="decimal"
          value={texto}
          onChange={(e) => setBorrador(e.target.value)}
          onBlur={() => {
            const n = Number((borrador ?? "").replace(",", "."));
            if (borrador != null && Number.isFinite(n)) onChange(Math.max(0, n));
            setBorrador(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-full bg-transparent px-2.5 py-2 text-[15px] tabular-nums text-white outline-none"
        />
      </span>
    </label>
  );
}

function Deslizador({
  etiqueta,
  ayuda,
  valor,
  onChange,
  max = 100,
  sufijo = "%",
  paso = 1,
}: {
  etiqueta: string;
  ayuda?: string;
  valor: number;
  onChange: (v: number) => void;
  max?: number;
  sufijo?: string;
  paso?: number;
}) {
  // Qué porción del riel va pintada. El navegador no lo sabe solo: se le pasa
  // por una variable CSS que usa el degradé (ver .deslizador en globals.css).
  const relleno = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;

  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-white/60">
          {etiqueta}
          {ayuda && <span className="ml-1.5 text-[10px] text-white/35">{ayuda}</span>}
        </span>
        <span className="rounded-md border border-good-claro/30 bg-good-claro/10 px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-good-claro">
          {valor.toLocaleString("es-EC")}
          {sufijo}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--relleno": `${relleno}%` } as React.CSSProperties}
        className="deslizador mt-2"
      />
      {/* Los extremos del recorrido, para saber contra qué se está moviendo. */}
      <span className="mt-0.5 flex justify-between font-mono text-[9px] text-white/25">
        <span>0</span>
        <span>
          {max.toLocaleString("es-EC")}
          {sufijo}
        </span>
      </span>
    </label>
  );
}

function Cifra({
  etiqueta,
  valor,
  nota,
  tono = "neutro",
  grande,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  tono?: "neutro" | "bien" | "mal";
  grande?: boolean;
}) {
  const color = tono === "bien" ? "text-good-claro" : tono === "mal" ? "text-critical-claro" : "text-white";
  return (
    <div className="rounded border border-white/10 bg-black/20 px-3 py-2.5">
      <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/40">
        {etiqueta}
      </p>
      <p className={`mt-1 font-semibold tabular-nums ${grande ? "text-[26px]" : "text-[19px]"} leading-none ${color}`}>
        {valor}
      </p>
      {nota && <p className="mt-1.5 text-[10.5px] leading-tight text-white/35">{nota}</p>}
    </div>
  );
}

/* -------------------------------- La pantalla ----------------------------- */

export default function CosteoCalculadora({ fichas }: { fichas: FichaCalculadora[] }) {
  const [v, setV] = useState<Valores>(POR_DEFECTO);
  const [producto, setProducto] = useState("");
  const [avanzado, setAvanzado] = useState(false);

  const [catalogo, setCatalogo] = useState<ProductoShopify[]>([]);
  const [catalogoAl, setCatalogoAl] = useState<string | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const [guardado, setGuardado] = useState<"limpio" | "guardando" | "guardado">("limpio");
  /** Los ajustes guardados de cada producto, por nombre. */
  const ajustes = useRef<Record<string, Partial<Valores>>>({});
  /** Si el producto elegido ya tenía ajustes guardados. En estado y no leyendo
   * el ref: un ref leído durante el render no vuelve a dibujar cuando cambia,
   * así que el aviso se quedaba pegado del producto anterior. */
  const [tieneGuardado, setTieneGuardado] = useState(false);

  const set = (clave: keyof Valores) => (n: number) => setV((p) => ({ ...p, [clave]: n }));

  /* ----------------------------- El catálogo ----------------------------- */

  // Sin tocar `refrescando` acá dentro: esta función se llama desde un efecto
  // al montar, y un setState en la primera línea de lo que un efecto invoca
  // dispara un render en cascada. El indicador de "actualizando" lo maneja el
  // botón, que es el único lugar donde alguien está esperando ver algo.
  const traerCatalogo = useCallback(async (forzar: boolean) => {
    try {
      const res = await fetch(`/api/shopify/catalogo${forzar ? "?refrescar=1" : ""}`);
      const j = await res.json();
      if (j.error) {
        setCatalogoError(j.error);
      } else {
        setCatalogoError(null);
        setCatalogo(j.productos ?? []);
        setCatalogoAl(j.actualizadoEn ?? null);
      }
    } catch {
      setCatalogoError("No se pudo consultar Shopify.");
    }
  }, []);

  async function refrescarAMano() {
    setRefrescando(true);
    await traerCatalogo(true);
    setRefrescando(false);
  }

  useEffect(() => {
    // La primera lectura sale con un temporizador de cero y no como llamada
    // directa: así el efecto no toca ningún estado de forma síncrona, que es
    // lo que dispara renders en cascada.
    const alToque = setTimeout(() => traerCatalogo(false), 0);
    // Cada dos minutos, para que un producto recién creado en Shopify aparezca
    // en el selector sin que nadie recargue la página.
    const cadaDosMinutos = setInterval(() => traerCatalogo(false), 2 * 60 * 1000);
    return () => {
      clearTimeout(alToque);
      clearInterval(cadaDosMinutos);
    };
  }, [traerCatalogo]);

  useEffect(() => {
    let vivo = true;
    fetch("/api/calculadora")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (vivo && j?.ajustes) ajustes.current = j.ajustes;
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  /* --------------------------- Guardado automático ----------------------- */

  const guardar = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!producto) return;
    if (guardar.current) clearTimeout(guardar.current);
    // Medio segundo de espera: mover un deslizador dispara veinte cambios y no
    // hacen falta veinte escrituras, hace falta la última.
    guardar.current = setTimeout(() => {
      setGuardado("guardando");
      ajustes.current[producto] = v;
      setTieneGuardado(true);
      fetch("/api/calculadora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto, data: v, parche: true }),
      })
        .then(() => setGuardado("guardado"))
        .catch(() => setGuardado("limpio"));
    }, 500);
    return () => {
      if (guardar.current) clearTimeout(guardar.current);
    };
  }, [v, producto]);

  /** Carga un producto: primero lo guardado, y si no hay, lo que diga Shopify. */
  function elegir(titulo: string) {
    setProducto(titulo);
    if (!titulo) return;
    const delCatalogo = catalogo.find((p) => p.titulo === titulo);
    const ficha = fichas.find((f) => f.name === titulo);
    const previo = ajustes.current[titulo];
    setTieneGuardado(Boolean(previo));

    setV((actual) => ({
      ...actual,
      precio: previo?.precio ?? delCatalogo?.precio ?? ficha?.salePrice ?? actual.precio,
      costoProducto: previo?.costoProducto ?? delCatalogo?.costo ?? ficha?.unitCost ?? actual.costoProducto,
      flete: previo?.flete ?? ficha?.flete ?? actual.flete,
      cpa: previo?.cpa ?? (ficha?.cpaTarget && ficha.cpaTarget > 0 ? ficha.cpaTarget : actual.cpa),
      gastoAdm: previo?.gastoAdm ?? actual.gastoAdm,
      confirmacion: previo?.confirmacion ?? (ficha?.efectividad != null ? Math.round(ficha.efectividad * 100) : actual.confirmacion),
      devolucion: previo?.devolucion ?? (ficha?.devoluciones != null ? Math.round(ficha.devoluciones * 100) : actual.devolucion),
      checkouts: previo?.checkouts ?? actual.checkouts,
      utilidadDeseada: previo?.utilidadDeseada ?? actual.utilidadDeseada,
    }));
  }

  /* ------------------------------ Los números ---------------------------- */

  const l = useMemo(() => leer(v), [v]);

  const escenarios = useMemo(() => {
    const conPack = { ...v, precio: v.precio * 1.4 };
    const filas = [
      { nombre: "Actual", val: v },
      { nombre: "+ Packs (AOV +40%)", val: conPack },
      { nombre: "+ Packs, confirmación 50%", val: { ...conPack, confirmacion: 50 } },
      { nombre: "Solo confirmación 50%", val: { ...v, confirmacion: 50 } },
    ];
    return filas.map((f) => {
      const r = calcularCosteo(aEntrada(f.val));
      return {
        nombre: f.nombre,
        aov: f.val.precio,
        confirmacion: f.val.confirmacion,
        entregadas: r.dia.entregados,
        utilidad: r.pauta.utilidadConPautaReal,
      };
    });
  }, [v]);

  const topeBarra = Math.max(...escenarios.map((e) => Math.abs(e.utilidad)), 1);
  const rentable = l.utilidadDia > 0;
  const holgura = v.confirmacion - l.confirmacionEquilibrio;

  const listaProductos = useMemo(() => {
    // El catálogo de Shopify manda. Se le suman los productos que solo existen
    // en el panel, para que no desaparezca ninguno mientras la tienda responde.
    const vistos = new Set(catalogo.map((p) => p.titulo));
    const soloPanel = fichas.filter((f) => !vistos.has(f.name)).map((f) => f.name);
    return [...catalogo.map((p) => p.titulo), ...soloPanel].sort((a, b) => a.localeCompare(b, "es"));
  }, [catalogo, fichas]);

  // La hora de la última revisión sale del propio dato. Antes se calculaba
  // "hace N segundos" con Date.now() en pleno render, que es impuro: dos
  // renders seguidos daban textos distintos sin que cambiara ningún estado.
  const revisadoA = catalogoAl
    ? new Date(catalogoAl).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-brand-navy-deep text-white">
      <div className="flex flex-col gap-3 p-4 md:p-5">
        {/* ------------------------------ 1 ------------------------------- */}
        <Seccion n={1} titulo="Elige el producto de tu catálogo">
          <select
            value={producto}
            onChange={(e) => elegir(e.target.value)}
            className="w-full rounded border border-white/12 bg-black/25 px-3 py-2.5 text-[15px] text-white outline-none transition focus:border-good-claro/70"
            aria-label="Producto"
          >
            <option value="">Escribir los números a mano</option>
            {listaProductos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {producto && (
              <Chip>Precio de venta: {usd(v.precio)}</Chip>
            )}
            <Chip>
              {/* El puntito late mientras el catálogo esté fresco: es la señal
                  de que la lista se mantiene sola y no hay que recargar. */}
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-good-claro align-middle [animation:respirar_2.4s_ease-in-out_infinite]" />
              {catalogo.length > 0 ? `${catalogo.length} productos · Shopify en vivo` : "Consultando Shopify…"}
            </Chip>
            {producto && tieneGuardado && <Chip>Ajustes guardados</Chip>}
            {guardado === "guardando" && producto && <Chip tenue>Guardando…</Chip>}
            {guardado === "guardado" && producto && <Chip tenue>Guardado</Chip>}
            <button
              type="button"
              onClick={refrescarAMano}
              disabled={refrescando}
              className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-white/60 transition hover:border-white/40 hover:text-white disabled:opacity-50"
            >
              {refrescando ? "Actualizando…" : "Actualizar desde Shopify"}
            </button>
          </div>

          <p className="mt-2 text-[10.5px] text-white/30">
            {catalogoError
              ? catalogoError
              : revisadoA != null
                ? `Lista revisada a las ${revisadoA}. Se revisa sola cada 2 minutos, así que un producto nuevo aparece sin recargar. Todo lo que cambies se guarda solo.`
                : "Todo lo que cambies se guarda solo y queda para la próxima vez, también desde el celular."}
          </p>
        </Seccion>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* ----------------------------- 2 ------------------------------ */}
          <Seccion n={2} titulo="Costos y funnel">
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo etiqueta="Precio de venta / AOV" valor={v.precio} onChange={set("precio")} prefijo="$" />
              <Campo etiqueta="Costo de producto" valor={v.costoProducto} onChange={set("costoProducto")} prefijo="$" />
              <Campo etiqueta="Flete" ayuda="por despacho" valor={v.flete} onChange={set("flete")} prefijo="$" />
              <Campo etiqueta="CPA de ads" ayuda="por checkout" valor={v.cpa} onChange={set("cpa")} prefijo="$" />
              <Campo etiqueta="Gasto administrativo" ayuda="por pedido entregado" valor={v.gastoAdm} onChange={set("gastoAdm")} prefijo="$" />
            </div>

            <div className="mt-4 flex flex-col gap-4 border-t border-white/8 pt-4">
              <Deslizador etiqueta="Tasa de confirmación" valor={v.confirmacion} onChange={set("confirmacion")} />
              <Deslizador
                etiqueta="Tasa de devolución"
                ayuda="sobre lo despachado"
                valor={v.devolucion}
                onChange={set("devolucion")}
              />
              <Deslizador
                etiqueta="Checkouts / día"
                ayuda="escala de ads"
                valor={v.checkouts}
                onChange={set("checkouts")}
                max={1000}
                sufijo=""
                paso={5}
              />
            </div>
          </Seccion>

          {/* ----------------------------- 3 ------------------------------ */}
          <Seccion n={3} titulo="Resultado por día">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Cifra
                etiqueta="Utilidad / día"
                valor={usd0(l.utilidadDia)}
                nota={rentable ? "ganas dinero" : "estás perdiendo"}
                tono={rentable ? "bien" : "mal"}
              />
              <Cifra etiqueta="Entregas cobradas / día" valor={dec1(l.entregadas)} nota="ventas reales" />
              <Cifra
                etiqueta="Utilidad / pedido"
                valor={usd(l.utilidadPedido)}
                nota="por entregado"
                tono={l.utilidadPedido >= 0 ? "bien" : "mal"}
              />
              <Cifra etiqueta="Costo real a venta" valor={usd(l.cpaEfectivo)} nota="CPA efectivo" />
              <Cifra etiqueta="Inversión ads / día" valor={usd0(l.inversionAds)} nota="presupuesto" />
              <Cifra
                etiqueta="ROAS"
                valor={`${l.roas.toFixed(2)}x`}
                nota="ingreso ÷ ads"
                tono={l.roas >= 1 ? "bien" : "mal"}
              />
            </div>

            {/* El veredicto en una línea. Es lo que alguien repite en voz alta
                cuando le preguntan si se puede escalar. */}
            <div
              className={`mt-3 rounded border px-3 py-2.5 ${
                rentable ? "border-good-claro/40 bg-good-claro/10" : "border-critical-claro/40 bg-critical-claro/10"
              }`}
            >
              <span
                className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${
                  rentable ? "bg-good-claro/15 text-good-claro" : "bg-critical-claro/15 text-critical-claro"
                }`}
              >
                {rentable ? "Rentable" : "En pérdida"}
              </span>
              <span className="text-[12.5px] leading-relaxed text-white/80">
                {rentable ? (
                  <>
                    Ganas <strong className="font-semibold text-white">{usd0(l.utilidadDia)}/día</strong>{" "}
                    (~{usd0(l.utilidadDia * 30)}/mes) con {dec1(l.entregadas)} ventas entregadas.
                    {holgura >= 10 ? " Acá sí conviene escalar el presupuesto." : " Con poca holgura: sube el presupuesto de a poco."}
                  </>
                ) : (
                  <>
                    Pierdes <strong className="font-semibold text-white">{usd0(Math.abs(l.utilidadDia))}/día</strong>.
                    Baja el CPA a menos de {usd(l.cpaBreakeven)} por checkout, o sube la confirmación por encima de{" "}
                    {pctTxt(l.confirmacionEquilibrio)}.
                  </>
                )}
              </span>
            </div>

            {/* La barra de equilibrio: dónde estás contra dónde tienes que
                estar. Un número suelto no dice si 70% es mucho o poco. */}
            <div className="mt-3">
              <p className="text-[11px] text-white/50">
                Confirmación de equilibrio ={" "}
                <strong className="font-semibold text-white">{pctTxt(l.confirmacionEquilibrio)}</strong>{" "}
                <span className="text-white/35">(tu actual: {pctTxt(v.confirmacion)})</span>
              </p>
              <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full ${rentable ? "bg-good-claro" : "bg-critical-claro"}`}
                  style={{ width: `${Math.min(100, Math.max(1, v.confirmacion))}%` }}
                />
                <div
                  className="absolute inset-y-0 w-[2px] bg-warning"
                  style={{ left: `${Math.min(100, Math.max(0, l.confirmacionEquilibrio))}%` }}
                  aria-hidden
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-white/30">
                <span>0%</span>
                <span>debes estar a la derecha de la línea amarilla</span>
                <span>100%</span>
              </div>
            </div>
          </Seccion>
        </div>

        {/* ------------------------------ 4 ------------------------------- */}
        <Seccion n={4} titulo="Escenarios para escalar" nota="utilidad diaria">
          <div className="flex items-end gap-3 overflow-x-auto pb-1">
            {escenarios.map((e) => {
              const alto = Math.max(4, (Math.abs(e.utilidad) / topeBarra) * 118);
              const bueno = e.utilidad >= 0;
              return (
                <div key={e.nombre} className="flex min-w-[92px] flex-1 flex-col items-center gap-1.5">
                  <span className={`text-[11px] font-semibold tabular-nums ${bueno ? "text-good-claro" : "text-critical-claro"}`}>
                    {usd0(e.utilidad)}
                  </span>
                  <div
                    className={`w-full rounded-t ${bueno ? "bg-good-claro/75" : "bg-critical-claro/70"}`}
                    style={{ height: `${alto}px` }}
                  />
                  <span className="text-center text-[10px] leading-tight text-white/40">{e.nombre}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 overflow-x-auto border-t border-white/8 pt-3">
            <table className="w-full min-w-[520px] text-[12px]">
              <thead>
                <tr className="text-left text-[9.5px] uppercase tracking-[0.1em] text-white/35">
                  <th className="py-1.5 font-semibold">Escenario</th>
                  <th className="py-1.5 text-right font-semibold">AOV</th>
                  <th className="py-1.5 text-right font-semibold">Confirm.</th>
                  <th className="py-1.5 text-right font-semibold">Entregas/día</th>
                  <th className="py-1.5 text-right font-semibold">Utilidad/día</th>
                </tr>
              </thead>
              <tbody>
                {escenarios.map((e) => (
                  <tr key={e.nombre} className="border-t border-white/6">
                    <td className="py-1.5 text-white/75">{e.nombre}</td>
                    <td className="py-1.5 text-right tabular-nums text-white/55">{usd(e.aov)}</td>
                    <td className="py-1.5 text-right tabular-nums text-white/55">{pctTxt(e.confirmacion)}</td>
                    <td className="py-1.5 text-right tabular-nums text-white/55">{dec1(e.entregadas)}</td>
                    <td className={`py-1.5 text-right font-semibold tabular-nums ${e.utilidad >= 0 ? "text-good-claro" : "text-critical-claro"}`}>
                      {usd0(e.utilidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
            Todos los escenarios mantienen tus {v.checkouts} checkouts/día, flete de {usd(v.flete)}, CPA
            de {usd(v.cpa)} y administrativo de {usd(v.gastoAdm)}. «Packs» asume subir el precio un 40%
            sin cambiar el costo unitario — ajustá el precio arriba si tu oferta real es otra.
          </p>
        </Seccion>

        {/* ------------------------------ 5 ------------------------------- */}
        <Seccion n={5} titulo="Tus CPA clave">
          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <div>
              <Campo
                etiqueta="Utilidad deseada por pedido"
                ayuda="% del precio de venta"
                valor={v.utilidadDeseada}
                onChange={set("utilidadDeseada")}
              />
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Cifra
                etiqueta="CPA breakeven"
                valor={usd(l.cpaBreakeven)}
                nota="pasado de acá, el día pierde"
                tono={v.cpa <= l.cpaBreakeven ? "bien" : "mal"}
                grande
              />
              <Cifra
                etiqueta={`CPA ideal (${v.utilidadDeseada.toFixed(0)}%)`}
                valor={usd(l.cpaIdeal)}
                nota={`para ganar ${usd(v.precio * (v.utilidadDeseada / 100))} por pedido`}
                grande
              />
              <Cifra
                etiqueta="Tu CPA actual"
                valor={usd(v.cpa)}
                nota={
                  v.cpa <= l.cpaIdeal
                    ? "estás mejor que tu meta"
                    : v.cpa <= l.cpaBreakeven
                      ? "ganás, pero por debajo de tu meta"
                      : "por encima del equilibrio"
                }
                tono={v.cpa <= l.cpaIdeal ? "bien" : v.cpa <= l.cpaBreakeven ? "neutro" : "mal"}
                grande
              />
            </div>
          </div>
        </Seccion>

        {/* --------------------------- Lo fino --------------------------- */}
        <section className="rounded-lg border border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setAvanzado((x) => !x)}
            aria-expanded={avanzado}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/[0.03] md:px-5"
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
              Cómo se arma la cuenta
            </span>
            <span className="text-[11px] text-white/35">{avanzado ? "Cerrar" : "Ver"}</span>
          </button>

          {avanzado && (
            <div className="border-t border-white/8 px-4 py-4 md:px-5">
              <table className="w-full text-[12px]">
                <tbody>
                  {[
                    ["Checkouts que entran", `${v.checkouts}`],
                    ["Se confirman y despachan", dec1(l.r.dia.despachados)],
                    ["Vuelven", dec1(l.r.dia.devueltos)],
                    ["Se cobran", dec1(l.entregadas)],
                    ["Ingreso cobrado", usd0(l.r.dia.ingresoEntregado)],
                    ["− Mercadería", `− ${usd0(l.entregadas * v.costoProducto)}`],
                    ["− Flete (sobre lo despachado)", `− ${usd0(l.r.dia.despachados * v.flete)}`],
                    ["− Administrativo", `− ${usd0(l.entregadas * v.gastoAdm)}`],
                    ["− Publicidad", `− ${usd0(l.inversionAds)}`],
                  ].map(([k, val]) => (
                    <tr key={k} className="border-b border-white/6 last:border-b-0">
                      <td className="py-1.5 text-white/55">{k}</td>
                      <td className="py-1.5 text-right tabular-nums text-white/80">{val}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-white/15">
                    <td className="py-2 font-semibold text-white">Utilidad del día</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${rentable ? "text-good-claro" : "text-critical-claro"}`}>
                      {usd0(l.utilidadDia)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-3 text-[10.5px] leading-relaxed text-white/30">
                El flete se cobra sobre TODO lo despachado, se entregue o se devuelva: es el costo
                que más se subestima en contraentrega. La devolución que tecleás arriba es sobre lo
                despachado, que es como la reporta la transportadora.
              </p>
            </div>
          )}
        </section>

        <button
          type="button"
          onClick={() => {
            setV(POR_DEFECTO);
            setProducto("");
          }}
          className="self-start text-[11px] text-white/35 underline transition hover:text-white/70"
        >
          Volver a empezar
        </button>
      </div>
    </div>
  );
}

function Chip({ children, tenue }: { children: React.ReactNode; tenue?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] ${
        tenue ? "border-white/8 text-white/35" : "border-white/15 text-white/60"
      }`}
    >
      {children}
    </span>
  );
}
