"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BuscadorProducto from "../buscador-producto";

// La calculadora de precios, con lo mejor de "Costeo y utilidad".
//
// Hubo dos calculadoras seguidas en el menú y se leían como lo mismo. Quedó
// esta —la de precio sugerido, que es la que el equipo usa para decidir a
// cuánto vender— y se le trajo de la otra lo que servía: el catálogo de
// Shopify en vivo, los deslizadores, el veredicto en una frase con qué cambiar,
// la confirmación de equilibrio, los escenarios en barras y el desglose de la
// cuenta (septiembre de 2026).
//
// EL GUARDADO
// "En la de costeo no permite guardar": no tenía botón, no avisaba cuando el
// servidor rechazaba el guardado (decía "Guardado" igual), y si se elegía un
// producto antes de que llegaran los ajustes guardados, el guardado
// automático pisaba lo que había con los valores por defecto. Acá:
//   - el selector espera a que lleguen los ajustes,
//   - elegir un producto NO guarda; guarda el primer cambio que se haga,
//   - se guarda mezclando con lo que ya había (la recomendación de un producto
//     que se escribe desde otra pantalla ya no se borra),
//   - si el servidor dice que no, se muestra por qué.

// Lo que se guarda por producto, compartido con todo el equipo. Son strings
// porque es lo que hay en los campos: convertir al guardar y volver a formatear
// al leer solo agrega formas de perder un decimal.
type Ajuste = {
  productCost: string;
  shippingCost: string;
  operatingCost: string;
  adSpend: string;
  gatewayFeePct: string;
  ivaPct: string;
  mode: "margin" | "fixed";
  marginPct: string;
  fixedProfit: string;
  confirmationPct: string;
  returnPct: string;
  ordersPerDay: string;
  adjustForDelivery: boolean;
  priceOverride: string;
  /** Notas del análisis, para que otro entienda por qué quedaron esos números. */
  nota?: string;
};

/**
 * Lo que guardaba "Costeo y utilidad", con otros nombres. Los productos que
 * solo se trabajaron allá no pierden sus números: se traducen al abrirlos.
 */
type AjusteCosteo = {
  precio?: number;
  costoProducto?: number;
  flete?: number;
  cpa?: number;
  gastoAdm?: number;
  confirmacion?: number;
  devolucion?: number;
  checkouts?: number;
  utilidadDeseada?: number;
};

// Producto que se puede cargar de un clic: precio y costo salen de Shopify en
// vivo (unitCost por variante), CPA y gasto operativo de Rentabilidad.
export type CalcProduct = {
  name: string;
  /**
   * El ID del producto en Dropi.
   *
   * Emilia lo pidió con todas las letras: "para yo poder crear la calculadora
   * y me jale la información, yo pongo el ID". Acá es solo para buscar y para
   * poder copiarlo; el que manda sigue siendo el nombre.
   */
  sku?: string | null;
  price: number | null;
  unitCost: number | null;
  cpa: number | null;
  operatingExpensePerOrder: number | null;
  /**
   * La realidad operativa, cuando el producto la tiene cargada. Es lo que
   * separa una calculadora de una planilla: sin efectividad ni devoluciones,
   * el resultado describe un negocio que no es este.
   */
  flete: number | null;
  efectividad: number | null;
  devoluciones: number | null;
};

type ProductoShopify = {
  id: string;
  titulo: string;
  sku: string | null;
  precio: number | null;
  costo: number | null;
};

const money = (n: number) =>
  isFinite(n) ? n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) : "—";
const money0 = (n: number) =>
  isFinite(n) ? n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "—";
const pct = (n: number) => (isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");
const num = (v: string) => Number(v) || 0;

// --- El modelo de la operación real --------------------------------------
//
// De cada checkout que paga la pauta, solo una parte se confirma y de esa
// parte una porción se devuelve. Lo que de verdad se cobra es
// `delivered = confirmación × (1 − devolución)`, y todos los números cuelgan
// de ahí. El flete se paga sobre todo lo despachado (confirmado), se entregue
// o vuelva.

type OperationInput = {
  aov: number;
  cogs: number;
  flete: number;
  admin: number;
  cpa: number;
  conf: number; // 0–1
  dev: number; // 0–1, sobre lo despachado
  orders: number;
  iva: number; // 0–1
  gateway: number; // 0–1
  targetProfitPct: number; // 0–1, sobre el AOV entregado
};

function computeOperation(i: OperationInput) {
  const delivered = i.conf * (1 - i.dev);
  // Lo que queda del precio después de IVA y pasarela.
  const netPerDelivered = i.aov / (1 + i.iva) - i.aov * i.gateway;

  // Contribución de UN checkout (no de una venta entregada).
  const contribution =
    netPerDelivered * delivered - i.cogs * delivered - i.flete * i.conf - i.admin * delivered - i.cpa;

  // Hasta cuánto se puede pagar por checkout sin perder plata.
  const breakevenCpa = netPerDelivered * delivered - i.cogs * delivered - i.flete * i.conf - i.admin * delivered;
  const idealCpa = breakevenCpa - i.targetProfitPct * i.aov * delivered;

  // A qué confirmación la contribución llega a cero, con todo lo demás igual.
  // En este modelo la contribución es lineal en la confirmación:
  //   conf × [(neto − producto − adm) × (1 − dev) − flete] − cpa
  // así que se despeja directo.
  const porConfirmado = (netPerDelivered - i.cogs - i.admin) * (1 - i.dev) - i.flete;
  const confEquilibrio = porConfirmado > 0 ? Math.min(1, i.cpa / porConfirmado) : 1;

  const deliveriesPerDay = i.orders * delivered;
  const dailyProfit = i.orders * contribution;
  const adInvestment = i.orders * i.cpa;
  const ecpa = delivered > 0 ? i.cpa / delivered : Infinity;
  const roas = adInvestment > 0 ? (i.aov * deliveriesPerDay) / adInvestment : Infinity;

  return {
    delivered,
    contribution,
    breakevenCpa,
    idealCpa,
    confEquilibrio,
    deliveriesPerDay,
    dailyProfit,
    adInvestment,
    ecpa,
    roas,
    // Para el desglose de la cuenta del día.
    despachados: i.orders * i.conf,
    devueltos: i.orders * i.conf * i.dev,
    ingreso: i.aov * i.orders * delivered,
  };
}

type Operation = ReturnType<typeof computeOperation>;

function verdict(cpa: number, op: Operation) {
  // Un centavo de tolerancia: cuando el precio se calcula justo para el margen
  // objetivo, el CPA queda exactamente sobre el ideal y sin esto marcaría "en
  // el límite" por un error de redondeo.
  if (cpa <= op.idealCpa + 0.01) return { label: "Rentable", tone: "good" as const };
  if (cpa <= op.breakevenCpa) return { label: "En el límite", tone: "warn" as const };
  return { label: "Perdiendo", tone: "bad" as const };
}

/* ------------------------------ Piezas sueltas ---------------------------- */

/** Un deslizador con la cifra en un chip y los extremos a la vista. */
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
  valor: string;
  onChange: (v: string) => void;
  max?: number;
  sufijo?: string;
  paso?: number;
}) {
  const n = num(valor);
  // Qué porción del riel va pintada. El navegador no lo sabe solo: se le pasa
  // por una variable CSS que usa el degradé (ver .deslizador en globals.css).
  const relleno = max > 0 ? Math.min(100, Math.max(0, (n / max) * 100)) : 0;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">
          {etiqueta}
          {ayuda && <span className="ml-1.5 text-[10px] opacity-70">{ayuda}</span>}
        </span>
        <span className="flex items-center gap-1 rounded-md border border-accent/40 bg-good-bg/40 px-1.5 py-0.5">
          {/* La cifra también se escribe: el deslizador sirve para explorar,
              el número exacto para cargar el dato real. */}
          <input
            type="number"
            value={valor}
            min={0}
            max={max}
            step={paso}
            onChange={(e) => onChange(e.target.value)}
            className="w-14 bg-transparent text-right font-mono text-[12px] font-semibold tabular-nums text-accent-strong outline-none"
            aria-label={etiqueta}
          />
          {sufijo && <span className="font-mono text-[11px] text-accent-strong">{sufijo}</span>}
        </span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={paso}
        value={Math.min(n, max)}
        onChange={(e) => onChange(e.target.value)}
        style={{ "--relleno": `${relleno}%` } as React.CSSProperties}
        className="deslizador mt-2"
        aria-hidden
        tabIndex={-1}
      />
      <span className="mt-0.5 flex justify-between font-mono text-[9px] text-muted/70">
        <span>0</span>
        <span>
          {max.toLocaleString("es-EC")}
          {sufijo}
        </span>
      </span>
    </label>
  );
}

function Chip({ children, tono }: { children: React.ReactNode; tono?: "bien" | "mal" }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[11px] ${
        tono === "bien"
          ? "border-good/40 text-good"
          : tono === "mal"
            ? "border-critical/40 text-critical"
            : "border-border text-muted"
      }`}
    >
      {children}
    </span>
  );
}

/* -------------------------------- La pantalla ----------------------------- */

export default function PricingCalculator({ products }: { products: CalcProduct[] }) {
  const [productCost, setProductCost] = useState("8");
  const [shippingCost, setShippingCost] = useState("3.5");
  const [operatingCost, setOperatingCost] = useState("2");
  const [adSpend, setAdSpend] = useState("6");
  // En cero por pedido del dueño: "eso de comisión pasarela e IVA lo podemos
  // omitir, aquí en Ecuador no lo tenemos". Es venta contraentrega —se cobra
  // en efectivo al recibir—, así que no hay pasarela que cobre comisión. Los
  // campos siguen existiendo, plegados, para quien sí los necesite.
  const [gatewayFeePct, setGatewayFeePct] = useState("0");
  const [ivaPct, setIvaPct] = useState("0");
  const [mode, setMode] = useState<"margin" | "fixed">("margin");
  const [marginPct, setMarginPct] = useState("25");
  const [fixedProfit, setFixedProfit] = useState("6");
  const [selectedProduct, setSelectedProduct] = useState("");

  const [confirmationPct, setConfirmationPct] = useState("80");
  const [returnPct, setReturnPct] = useState("8");
  const [ordersPerDay, setOrdersPerDay] = useState("20");
  const [adjustForDelivery, setAdjustForDelivery] = useState(true);
  const [priceOverride, setPriceOverride] = useState("");
  const [verCuenta, setVerCuenta] = useState(false);

  // Los ajustes guardados por producto, compartidos con todo el equipo.
  const ajustesRef = useRef<Record<string, Partial<Ajuste> & AjusteCosteo>>({});
  const [ajustesListos, setAjustesListos] = useState(false);
  const [guardado, setGuardado] = useState<"limpio" | "guardando" | "guardado" | "error">("limpio");
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  // Si hay algo sin guardar. Elegir un producto carga sus números pero no
  // cuenta como cambio: guardarlo en ese momento era lo que pisaba los ajustes.
  const [sucio, setSucio] = useState(false);
  // En estado y no leyendo el ref al dibujar: un ref no vuelve a dibujar cuando cambia.
  const [tieneGuardado, setTieneGuardado] = useState(false);

  /* ----------------------------- El catálogo ----------------------------- */

  // Shopify en vivo, cada dos minutos: un producto recién creado en la tienda
  // aparece en el selector sin recargar la página.
  const [catalogo, setCatalogo] = useState<ProductoShopify[]>([]);
  const [catalogoAl, setCatalogoAl] = useState<string | null>(null);
  const [catalogoError, setCatalogoError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

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

  useEffect(() => {
    const alToque = setTimeout(() => traerCatalogo(false), 0);
    const cadaDosMinutos = setInterval(() => traerCatalogo(false), 2 * 60 * 1000);
    return () => {
      clearTimeout(alToque);
      clearInterval(cadaDosMinutos);
    };
  }, [traerCatalogo]);

  async function refrescarAMano() {
    setRefrescando(true);
    await traerCatalogo(true);
    setRefrescando(false);
  }

  // La lista del selector: lo que trajo el servidor (fichas + catálogo al
  // abrir) más lo que haya aparecido después en Shopify.
  const lista = useMemo(() => {
    const porNombre = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
    for (const c of catalogo) {
      const k = c.titulo.trim().toLowerCase();
      if (!porNombre.has(k)) {
        porNombre.set(k, {
          name: c.titulo,
          sku: c.sku,
          price: c.precio,
          unitCost: c.costo,
          cpa: null,
          operatingExpensePerOrder: null,
          flete: null,
          efectividad: null,
          devoluciones: null,
        });
      }
    }
    return [...porNombre.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [products, catalogo]);

  const revisadoA = catalogoAl
    ? new Date(catalogoAl).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" })
    : null;

  /* ------------------------------ Los ajustes ---------------------------- */

  useEffect(() => {
    let cancelado = false;
    fetch("/api/calculadora")
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return;
        ajustesRef.current = d.ajustes ?? {};
        setAjustesListos(true);
      })
      .catch(() => {
        // Si no se pueden leer, la calculadora sirve igual: se pierde el
        // compartir, no el cálculo.
        if (!cancelado) setAjustesListos(true);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  function loadFromProduct(name: string) {
    // Lo que quedó sin guardar del producto anterior se guarda ahora: el
    // guardado automático espera 800 ms y cambiar de producto en ese rato
    // mataba el temporizador y el cambio se perdía en silencio.
    if (selectedProduct && sucio && name !== selectedProduct) void guardar();
    setSelectedProduct(name);
    setSucio(false);
    setGuardado("limpio");
    setErrorGuardado(null);
    const p = lista.find((x) => x.name === name);
    if (!p) return;

    // Primero lo que sabe Shopify y Rentabilidad…
    if (p.cpa != null) setAdSpend(p.cpa.toFixed(2));
    if (p.operatingExpensePerOrder != null) setOperatingCost(p.operatingExpensePerOrder.toFixed(2));
    if (p.unitCost != null) setProductCost(p.unitCost.toFixed(2));
    if (p.price != null) setPriceOverride(p.price.toFixed(2));
    if (p.flete != null) setShippingCost(p.flete.toFixed(2));
    if (p.efectividad != null) setConfirmationPct((p.efectividad * 100).toFixed(0));
    if (p.devoluciones != null) setReturnPct((p.devoluciones * 100).toFixed(0));

    // …y encima lo que el equipo ya ajustó a mano, que le gana. Si el producto
    // solo se trabajó en "Costeo y utilidad", sus números se traducen.
    const g = ajustesRef.current[name];
    setTieneGuardado(Boolean(g));
    if (!g) {
      setNota("");
      return;
    }
    const s = (v: number | undefined) => (typeof v === "number" && isFinite(v) ? String(v) : undefined);
    const productCostG = g.productCost ?? s(g.costoProducto);
    const shippingG = g.shippingCost ?? s(g.flete);
    const operatingG = g.operatingCost ?? s(g.gastoAdm);
    const adSpendG = g.adSpend ?? s(g.cpa);
    const confG = g.confirmationPct ?? s(g.confirmacion);
    const retG = g.returnPct ?? s(g.devolucion);
    const ordersG = g.ordersPerDay ?? s(g.checkouts);
    const priceG = g.priceOverride ?? s(g.precio);
    const marginG = g.marginPct ?? s(g.utilidadDeseada);

    if (productCostG != null) setProductCost(productCostG);
    if (shippingG != null) setShippingCost(shippingG);
    if (operatingG != null) setOperatingCost(operatingG);
    if (adSpendG != null) setAdSpend(adSpendG);
    if (g.gatewayFeePct != null) setGatewayFeePct(g.gatewayFeePct);
    if (g.ivaPct != null) setIvaPct(g.ivaPct);
    if (g.mode === "margin" || g.mode === "fixed") setMode(g.mode);
    if (marginG != null) setMarginPct(marginG);
    if (g.fixedProfit != null) setFixedProfit(g.fixedProfit);
    if (confG != null) setConfirmationPct(confG);
    if (retG != null) setReturnPct(retG);
    if (ordersG != null) setOrdersPerDay(ordersG);
    if (typeof g.adjustForDelivery === "boolean") setAdjustForDelivery(g.adjustForDelivery);
    if (priceG != null) setPriceOverride(priceG);
    setNota(typeof g.nota === "string" ? g.nota : "");
  }

  /** Envuelve un setter para marcar que hay cambios sin guardar. */
  const cambia =
    <T,>(f: (v: T) => void) =>
    (v: T) => {
      f(v);
      setSucio(true);
      if (guardado !== "guardando") setGuardado("limpio");
    };

  const valores = useMemo<Ajuste>(
    () => ({
      productCost,
      shippingCost,
      operatingCost,
      adSpend,
      gatewayFeePct,
      ivaPct,
      mode,
      marginPct,
      fixedProfit,
      confirmationPct,
      returnPct,
      ordersPerDay,
      adjustForDelivery,
      priceOverride,
    }),
    [
      productCost,
      shippingCost,
      operatingCost,
      adSpend,
      gatewayFeePct,
      ivaPct,
      mode,
      marginPct,
      fixedProfit,
      confirmationPct,
      returnPct,
      ordersPerDay,
      adjustForDelivery,
      priceOverride,
    ],
  );

  const guardar = useCallback(async () => {
    if (!selectedProduct) return;
    const cuerpo = { ...valores, nota };
    setGuardado("guardando");
    setErrorGuardado(null);
    try {
      const res = await fetch("/api/calculadora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Mezclando con lo que ya había: la recomendación de un producto se
        // escribe desde "Productos que pierden plata" y no viaja en este cuerpo.
        body: JSON.stringify({ producto: selectedProduct, data: cuerpo, parche: true }),
      });
      if (res.ok) {
        ajustesRef.current[selectedProduct] = { ...ajustesRef.current[selectedProduct], ...cuerpo };
        setGuardado("guardado");
        setSucio(false);
        setTieneGuardado(true);
      } else {
        const j = await res.json().catch(() => null);
        setErrorGuardado(j?.error ?? `El servidor respondió ${res.status}.`);
        setGuardado("error");
      }
    } catch {
      setErrorGuardado("No hay conexión: los cambios siguen en pantalla, vuelve a intentar.");
      setGuardado("error");
    }
  }, [selectedProduct, valores, nota]);

  // Guardado automático, solo después de un cambio de verdad y con espera:
  // mover un deslizador dispara veinte cambios y alcanza con guardar el último.
  useEffect(() => {
    if (!selectedProduct || !ajustesListos || !sucio) return;
    const t = setTimeout(() => void guardar(), 800);
    return () => clearTimeout(t);
  }, [valores, nota, selectedProduct, ajustesListos, sucio, guardar]);

  /* ------------------------------ Los números ---------------------------- */

  const conf = Math.min(Math.max(num(confirmationPct) / 100, 0), 1);
  const dev = Math.min(Math.max(num(returnPct) / 100, 0), 1);
  const delivered = adjustForDelivery ? conf * (1 - dev) : 1;

  const result = useMemo(() => {
    const cogs = num(productCost);
    const flete = num(shippingCost);
    const admin = num(operatingCost);
    const cpa = num(adSpend);
    const iva = num(ivaPct) / 100;
    const gateway = num(gatewayFeePct) / 100;

    // Costo por venta REALMENTE cobrada: el flete se paga por cada paquete
    // despachado y la pauta por cada checkout, se entreguen o no; producto y
    // gasto operativo solo pesan sobre lo entregado.
    const conf_ = adjustForDelivery ? conf : 1;
    const cost = delivered > 0 ? cogs + admin + (flete * conf_ + cpa) / delivered : Infinity;

    const denomBase = 1 / (1 + iva) - gateway;

    let price: number;
    if (mode === "fixed") {
      price = denomBase > 0 ? (num(fixedProfit) + cost) / denomBase : NaN;
    } else {
      const margin = num(marginPct) / 100;
      const denom = denomBase - margin;
      price = denom > 0 ? cost / denom : NaN;
    }

    if (!isFinite(price) || price <= 0) return { valid: false as const, cost };

    const revenueBeforeIva = price / (1 + iva);
    const ivaAmount = price - revenueBeforeIva;
    const gatewayAmount = price * gateway;
    const profit = revenueBeforeIva - gatewayAmount - cost;
    const marginOfPrice = price > 0 ? (profit / price) * 100 : 0;

    return {
      valid: true as const,
      cost,
      price,
      ivaAmount,
      gatewayAmount,
      profit,
      marginOfPrice,
      roundedUp: Math.ceil(price) - 0.01, // ej. $24.99
      roundedWhole: Math.ceil(price),
    };
  }, [productCost, shippingCost, operatingCost, adSpend, gatewayFeePct, ivaPct, mode, marginPct, fixedProfit, adjustForDelivery, conf, delivered]);

  // El AOV del análisis: el precio que acaba de sugerir la calculadora, salvo
  // que se escriba uno propio (útil para evaluar el precio que YA se cobra).
  const suggestedPrice = result.valid ? result.price : 0;
  const aov = num(priceOverride) > 0 ? num(priceOverride) : suggestedPrice;

  const analysis = useMemo(() => {
    const base: OperationInput = {
      aov,
      cogs: num(productCost),
      flete: num(shippingCost),
      admin: num(operatingCost),
      cpa: num(adSpend),
      conf,
      dev,
      orders: num(ordersPerDay),
      iva: num(ivaPct) / 100,
      gateway: num(gatewayFeePct) / 100,
      targetProfitPct: mode === "margin" ? num(marginPct) / 100 : 0,
    };

    const scenarios = [
      { name: "Actual", input: base },
      {
        name: "Confirmación +10 pts",
        input: { ...base, conf: Math.min(1, base.conf + 0.1) },
        note: "si el call center confirma 10 puntos más",
      },
      {
        name: "Packs (AOV +40% / costo +60%)",
        input: { ...base, aov: base.aov * 1.4, cogs: base.cogs * 1.6 },
        note: "vender de a dos o tres unidades",
      },
      { name: "CPA −20%", input: { ...base, cpa: base.cpa * 0.8 }, note: "si la pauta mejora un 20%" },
      {
        name: "Confirmación 50%",
        input: { ...base, conf: 0.5 },
        note: "el piso de un mal día de call center",
      },
    ].map((s) => ({ ...s, out: computeOperation(s.input) }));

    return { base, current: scenarios[0].out, scenarios };
  }, [aov, productCost, shippingCost, operatingCost, adSpend, conf, dev, ordersPerDay, ivaPct, gatewayFeePct, mode, marginPct]);

  const status = verdict(num(adSpend), analysis.current);
  const statusClass =
    status.tone === "good"
      ? "bg-good-bg text-good"
      : status.tone === "warn"
        ? "bg-pending-bg text-accent-strong"
        : "bg-critical-bg text-critical";
  const ganaDia = analysis.current.dailyProfit > 0;
  const holgura = conf - analysis.current.confEquilibrio;
  const topeBarra = Math.max(...analysis.scenarios.map((s) => Math.abs(s.out.dailyProfit)), 1);

  const inputClass =
    "w-full bg-transparent border border-border rounded px-3 py-2 outline-none focus:border-accent tabular-nums";
  const labelClass = "block text-xs font-mono uppercase tracking-wide text-muted mb-1";

  const estadoGuardado =
    guardado === "guardando"
      ? "Guardando…"
      : guardado === "guardado"
        ? `Guardado en ${selectedProduct} — todo el equipo ve estos valores.`
        : guardado === "error"
          ? `No se guardó: ${errorGuardado}`
          : sucio
            ? "Hay cambios sin guardar: se guardan solos en un segundo, o apriétalo ahora."
            : tieneGuardado
              ? `Todo guardado en ${selectedProduct}.`
              : `${selectedProduct} todavía no tiene ajustes guardados: el primer cambio se guarda solo.`;

  const botonGuardar = (grande: boolean) =>
    selectedProduct ? (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={guardado === "guardando"}
          className={`rounded bg-accent font-medium text-white transition hover:bg-accent-strong disabled:opacity-40 ${
            grande ? "w-full px-4 py-2.5 text-sm" : "px-3 py-1.5 text-xs"
          }`}
        >
          {guardado === "guardando" ? "Guardando…" : "Guardar cambios"}
        </button>
        <p className={`text-xs ${guardado === "error" ? "text-critical" : guardado === "guardado" ? "text-good" : "text-muted"}`}>
          {estadoGuardado}
        </p>
      </div>
    ) : (
      <p className="text-xs text-muted">
        Elige un producto arriba para poder guardar esta estimación. Sin producto los números se calculan igual, pero no
        quedan asociados a nada.
      </p>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4 rounded border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Costos por pedido</h2>

          <div className="block">
            <span className={labelClass}>Cargar datos de un producto</span>
            {/* Se busca escribiendo: nombre, código o iniciales. */}
            <BuscadorProducto
              opciones={lista.map((p) => ({
                id: p.name,
                nombre: p.name,
                sku: p.sku,
                detalle: p.unitCost != null ? `costo ${p.unitCost.toFixed(2)}` : undefined,
              }))}
              valor={selectedProduct}
              onElegir={loadFromProduct}
              disabled={!ajustesListos}
              vacio={ajustesListos ? "— Escribir los números a mano —" : "Cargando lo guardado…"}
              placeholder="Escribe el nombre o las iniciales del producto…"
              ariaLabel="Producto"
            />
          </div>

          <div className="-mt-1 flex flex-wrap items-center gap-2">
            <Chip>
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-good align-middle [animation:respirar_2.4s_ease-in-out_infinite]" />
              {catalogo.length > 0
                ? `${catalogo.length} productos · Shopify en vivo`
                : catalogoError
                  ? "Shopify no respondió"
                  : "Consultando Shopify…"}
            </Chip>
            {selectedProduct && tieneGuardado && <Chip tono="bien">Tiene ajustes guardados</Chip>}
            <button
              type="button"
              onClick={refrescarAMano}
              disabled={refrescando}
              className="rounded-full border border-border px-3 py-1 text-[11px] text-muted transition hover:border-border-strong hover:text-foreground disabled:opacity-50"
            >
              {refrescando ? "Actualizando…" : "Actualizar desde Shopify"}
            </button>
          </div>
          <p className="-mt-2 text-[11px] text-muted">
            {catalogoError
              ? catalogoError
              : revisadoA
                ? `Lista revisada a las ${revisadoA}. Se revisa sola cada 2 minutos: un producto nuevo de Shopify aparece sin recargar.`
                : "La lista de Shopify se revisa sola cada 2 minutos."}
          </p>

          {selectedProduct && (
            <div className="flex flex-col gap-2">
              <textarea
                value={nota}
                onChange={(e) => cambia(setNota)(e.target.value.slice(0, 1500))}
                placeholder="Notas del análisis: qué se probó, qué conviene hacer…"
                rows={2}
                className="w-full resize-none rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
              {botonGuardar(false)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Costo del producto</span>
              <input className={inputClass} type="number" value={productCost} onChange={(e) => cambia(setProductCost)(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Envío / flete</span>
              <input className={inputClass} type="number" value={shippingCost} onChange={(e) => cambia(setShippingCost)(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Gasto operativo</span>
              <input className={inputClass} type="number" value={operatingCost} onChange={(e) => cambia(setOperatingCost)(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Publicidad (CPA por checkout)</span>
              <input className={inputClass} type="number" value={adSpend} onChange={(e) => cambia(setAdSpend)(e.target.value)} />
            </label>
          </div>

          {/* Pasarela e IVA quedan plegados y en cero: en contraentrega se
              cobra en efectivo al recibir, no hay pasarela ni IVA retenido. */}
          <details className="rounded border border-border bg-surface-2 px-3 py-2">
            <summary className="cursor-pointer text-xs text-muted">Comisión de pasarela e IVA — apagados</summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Comisión pasarela (%)</span>
                <input className={inputClass} type="number" value={gatewayFeePct} onChange={(e) => cambia(setGatewayFeePct)(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>IVA (%)</span>
                <input className={inputClass} type="number" value={ivaPct} onChange={(e) => cambia(setIvaPct)(e.target.value)} />
              </label>
            </div>
            <p className="mt-2 text-xs text-muted">
              Van en cero porque en contraentrega no aplican: el cliente paga en efectivo al recibir. Si alguna vez vendes
              con pago en línea, carga aquí el porcentaje real de tu pasarela y del IVA.
            </p>
          </details>

          <div className="flex flex-col gap-4 border-t border-border pt-3">
            <div>
              <h2 className="text-sm font-semibold">Realidad de la operación</h2>
              <p className="mt-1 text-xs text-muted">
                No todo checkout se cobra: parte no se confirma y parte se devuelve. Esto es lo que separa el CPA que
                muestra Meta del costo real de una venta cobrada.
              </p>
            </div>
            <Deslizador etiqueta="Tasa de confirmación" valor={confirmationPct} onChange={cambia(setConfirmationPct)} />
            <Deslizador
              etiqueta="Tasa de devolución"
              ayuda="sobre lo despachado"
              valor={returnPct}
              onChange={cambia(setReturnPct)}
            />
            <Deslizador
              etiqueta="Checkouts por día"
              ayuda="escala de la pauta"
              valor={ordersPerDay}
              onChange={cambia(setOrdersPerDay)}
              max={1000}
              sufijo=""
              paso={5}
            />
            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={adjustForDelivery}
                onChange={(e) => cambia(setAdjustForDelivery)(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Ajustar el precio sugerido por confirmación y devoluciones — el flete de los paquetes que vuelven y la
                pauta de los checkouts que no se confirman los terminan pagando las ventas que sí se cobran.
              </span>
            </label>
          </div>

          <div className="border-t border-border pt-3">
            <h2 className="mb-3 text-sm font-semibold">¿Qué quieres lograr?</h2>
            <div className="mb-3 flex gap-2">
              <button
                onClick={() => cambia(setMode)("margin")}
                className={`rounded px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
                  mode === "margin" ? "bg-accent text-white" : "bg-surface-2 text-muted"
                }`}
              >
                Margen %
              </button>
              <button
                onClick={() => cambia(setMode)("fixed")}
                className={`rounded px-3 py-1.5 font-mono text-xs uppercase tracking-wide ${
                  mode === "fixed" ? "bg-accent text-white" : "bg-surface-2 text-muted"
                }`}
              >
                Ganancia fija ($)
              </button>
            </div>
            {mode === "margin" ? (
              <Deslizador
                etiqueta="Margen deseado sobre el precio de venta"
                valor={marginPct}
                onChange={cambia(setMarginPct)}
                max={60}
              />
            ) : (
              <label className="block">
                <span className={labelClass}>Ganancia deseada por pedido ($)</span>
                <input className={inputClass} type="number" value={fixedProfit} onChange={(e) => cambia(setFixedProfit)(e.target.value)} />
              </label>
            )}

            {/* Guardar también acá abajo: quien llena todo de arriba hacia
                abajo llega al final, y ahí tiene que estar el botón. */}
            <div className="mt-4 border-t border-border pt-4">{botonGuardar(true)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold">Precio sugerido</h2>
          {!result.valid ? (
            <p className="text-sm text-critical">
              Con esos porcentajes de comisión + IVA + margen no da un precio positivo — baja el margen objetivo o la
              comisión de pasarela.
            </p>
          ) : (
            <>
              <div className="py-4 text-center">
                <p className="text-4xl font-bold tabular-nums">{money(result.price)}</p>
                <p className="mt-1 text-xs text-muted">precio exacto (IVA incluido)</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="rounded bg-surface-2 p-3">
                  <p className="text-lg font-semibold tabular-nums">{money(result.roundedWhole)}</p>
                  <p className="text-xs text-muted">redondeado a $ entero</p>
                </div>
                <div className="rounded bg-surface-2 p-3">
                  <p className="text-lg font-semibold tabular-nums">{money(result.roundedUp)}</p>
                  <p className="text-xs text-muted">estilo $X.99</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 border-t border-border pt-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Costos por venta cobrada{adjustForDelivery ? " (ajustados por entrega)" : ""}</span>
                  <span className="tabular-nums">{money(result.cost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">IVA retenido sobre el precio</span>
                  <span className="tabular-nums">{money(result.ivaAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comisión de pasarela</span>
                  <span className="tabular-nums">{money(result.gatewayAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Ganancia neta por venta cobrada</span>
                  <span className={`tabular-nums ${result.profit >= 0 ? "text-good" : "text-critical"}`}>{money(result.profit)}</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Margen efectivo sobre el precio</span>
                  <span className="tabular-nums">{result.marginOfPrice.toFixed(1)}%</span>
                </div>
              </div>
            </>
          )}

          {/* El veredicto en una línea, con qué cambiar. Es lo que alguien
              repite en voz alta cuando le preguntan si se puede escalar. */}
          <div
            className={`mt-auto rounded border px-3 py-2.5 text-sm ${
              ganaDia ? "border-good/40 bg-good-bg" : "border-critical/40 bg-critical-bg"
            }`}
          >
            <span
              className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                ganaDia ? "bg-good/15 text-good" : "bg-critical/15 text-critical"
              }`}
            >
              {ganaDia ? "Gana" : "Pierde"}
            </span>
            {ganaDia ? (
              <>
                Con el precio {money(aov)} ganas <b className="text-foreground">{money0(analysis.current.dailyProfit)}/día</b>{" "}
                (~{money0(analysis.current.dailyProfit * 30)}/mes) con {analysis.current.deliveriesPerDay.toFixed(1)} ventas
                cobradas.
                {holgura >= 0.1 ? " Hay holgura para escalar el presupuesto." : " Con poca holgura: sube el presupuesto de a poco."}
              </>
            ) : (
              <>
                Con el precio {money(aov)} pierdes <b className="text-foreground">{money0(Math.abs(analysis.current.dailyProfit))}/día</b>.
                Baja el CPA a menos de {money(analysis.current.breakevenCpa)} por checkout, o sube la confirmación por encima
                de {pct(analysis.current.confEquilibrio)}.
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- Análisis de la operación con el precio elegido ----------------- */}
      <div className="flex flex-col gap-5 rounded border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Rentabilidad real de la operación</h2>
            <p className="mt-1 text-xs text-muted">
              De cada 100 checkouts se cobran {(delivered * 100).toFixed(0)} — confirmación {confirmationPct}% menos{" "}
              {returnPct}% de devoluciones. Todo lo de abajo sale de ese número.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <label className="block">
              <span className={labelClass}>Precio a evaluar</span>
              <input
                className={`${inputClass} w-40`}
                type="number"
                value={priceOverride}
                placeholder={suggestedPrice ? suggestedPrice.toFixed(2) : "0.00"}
                onChange={(e) => cambia(setPriceOverride)(e.target.value)}
              />
              <span className="mt-1 block text-xs text-muted">vacío = el precio sugerido de arriba</span>
            </label>
            <span className={`rounded px-3 py-1.5 font-mono text-xs ${statusClass}`}>{status.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded bg-surface-2 p-3">
            <p className="text-xs text-muted">CPA breakeven</p>
            <p className="text-xl font-semibold tabular-nums">{money(analysis.current.breakevenCpa)}</p>
            <p className="mt-1 text-xs text-muted">arriba de esto se pierde plata</p>
          </div>
          <div className="rounded bg-surface-2 p-3">
            <p className="text-xs text-muted">CPA ideal</p>
            <p className="text-xl font-semibold tabular-nums">{money(analysis.current.idealCpa)}</p>
            <p className="mt-1 text-xs text-muted">
              {mode === "margin" ? `con ${marginPct}% de margen objetivo` : "define un margen % para calcularlo"}
            </p>
          </div>
          <div className="rounded bg-surface-2 p-3">
            <p className="text-xs text-muted">Costo real por venta (eCPA)</p>
            <p className="text-xl font-semibold tabular-nums">{money(analysis.current.ecpa)}</p>
            <p className="mt-1 text-xs text-muted">el CPA de Meta ÷ {pct(delivered)}</p>
          </div>
          <div className="rounded bg-surface-2 p-3">
            <p className="text-xs text-muted">ROAS</p>
            <p className="text-xl font-semibold tabular-nums">
              {isFinite(analysis.current.roas) ? analysis.current.roas.toFixed(2) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted">sobre ventas entregadas</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="flex justify-between md:block">
            <span className="text-xs text-muted">Contribución por checkout</span>
            <p className={`font-semibold tabular-nums ${analysis.current.contribution >= 0 ? "text-good" : "text-critical"}`}>
              {money(analysis.current.contribution)}
            </p>
          </div>
          <div className="flex justify-between md:block">
            <span className="text-xs text-muted">Entregas por día</span>
            <p className="font-semibold tabular-nums">{analysis.current.deliveriesPerDay.toFixed(1)}</p>
          </div>
          <div className="flex justify-between md:block">
            <span className="text-xs text-muted">Inversión diaria en pauta</span>
            <p className="font-semibold tabular-nums">{money(analysis.current.adInvestment)}</p>
          </div>
          <div className="flex justify-between md:block">
            <span className="text-xs text-muted">Utilidad diaria</span>
            <p className={`font-semibold tabular-nums ${analysis.current.dailyProfit >= 0 ? "text-good" : "text-critical"}`}>
              {money(analysis.current.dailyProfit)}
            </p>
          </div>
        </div>

        {/* La barra de equilibrio: dónde estás contra dónde tienes que estar.
            Un número suelto no dice si 70% de confirmación es mucho o poco. */}
        <div>
          <p className="text-xs text-muted">
            Confirmación de equilibrio ={" "}
            <b className="text-foreground">{pct(analysis.current.confEquilibrio)}</b>{" "}
            <span className="opacity-70">(la tuya: {pct(conf)})</span>
          </p>
          <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`h-full rounded-full ${conf >= analysis.current.confEquilibrio ? "bg-good" : "bg-critical"}`}
              style={{ width: `${Math.min(100, Math.max(1, conf * 100))}%` }}
            />
            <div
              className="absolute inset-y-0 w-[2px] bg-warning"
              style={{ left: `${Math.min(100, Math.max(0, analysis.current.confEquilibrio * 100))}%` }}
              aria-hidden
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted">
            <span>0%</span>
            <span>debes estar a la derecha de la línea amarilla</span>
            <span>100%</span>
          </div>
        </div>

        {/* Los escenarios, primero en barras para compararlos de un vistazo. */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Escenarios · utilidad diaria</h3>
          <div className="flex items-end gap-3 overflow-x-auto pb-1">
            {analysis.scenarios.map((s) => {
              const alto = Math.max(4, (Math.abs(s.out.dailyProfit) / topeBarra) * 110);
              const bueno = s.out.dailyProfit >= 0;
              return (
                <div key={s.name} className="flex min-w-[92px] flex-1 flex-col items-center gap-1.5">
                  <span className={`text-[11px] font-semibold tabular-nums ${bueno ? "text-good" : "text-critical"}`}>
                    {money0(s.out.dailyProfit)}
                  </span>
                  <div
                    className={`w-full rounded-t ${bueno ? "bg-good/70" : "bg-critical/70"}`}
                    style={{ height: `${alto}px` }}
                  />
                  <span className="text-center text-[10px] leading-tight text-muted">{s.name}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left font-mono text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-4">Escenario</th>
                <th className="py-2 pr-4 text-right">Contribución / checkout</th>
                <th className="py-2 pr-4 text-right">Utilidad diaria</th>
                <th className="py-2 pr-4 text-right">eCPA</th>
                <th className="py-2 pr-4 text-right">CPA breakeven</th>
                <th className="py-2 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {analysis.scenarios.map((s, idx) => (
                <tr key={s.name} className={`border-t border-border ${idx === 0 ? "font-medium" : ""}`}>
                  <td className="py-2 pr-4">
                    {s.name}
                    {s.note && <span className="block text-xs font-normal text-muted">{s.note}</span>}
                  </td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${s.out.contribution >= 0 ? "text-good" : "text-critical"}`}>
                    {money(s.out.contribution)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(s.out.dailyProfit)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(s.out.ecpa)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(s.out.breakevenCpa)}</td>
                  <td className="py-2 text-right tabular-nums">{isFinite(s.out.roas) ? s.out.roas.toFixed(2) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* La cuenta del día, renglón por renglón: la prueba de la utilidad. */}
        <section className="rounded border border-border">
          <button
            type="button"
            onClick={() => setVerCuenta((x) => !x)}
            aria-expanded={verCuenta}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted transition hover:bg-surface-2"
          >
            Cómo se arma la cuenta del día
            <span className="font-normal normal-case">{verCuenta ? "Cerrar" : "Ver"}</span>
          </button>
          {verCuenta && (
            <div className="border-t border-border px-4 py-3">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ["Checkouts que entran", `${num(ordersPerDay)}`],
                    ["Se confirman y despachan", analysis.current.despachados.toFixed(1)],
                    ["Vuelven", analysis.current.devueltos.toFixed(1)],
                    ["Se cobran", analysis.current.deliveriesPerDay.toFixed(1)],
                    ["Ingreso cobrado", money0(analysis.current.ingreso)],
                    ["− Producto", `− ${money0(analysis.current.deliveriesPerDay * num(productCost))}`],
                    ["− Flete (sobre lo despachado)", `− ${money0(analysis.current.despachados * num(shippingCost))}`],
                    ["− Gasto operativo", `− ${money0(analysis.current.deliveriesPerDay * num(operatingCost))}`],
                    ["− Publicidad", `− ${money0(analysis.current.adInvestment)}`],
                  ].map(([k, val]) => (
                    <tr key={k} className="border-b border-border/60 last:border-b-0">
                      <td className="py-1.5 text-muted">{k}</td>
                      <td className="py-1.5 text-right tabular-nums">{val}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <td className="py-2 font-semibold">Utilidad del día</td>
                    <td className={`py-2 text-right font-semibold tabular-nums ${ganaDia ? "text-good" : "text-critical"}`}>
                      {money0(analysis.current.dailyProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">
                El flete se paga sobre TODO lo despachado, se entregue o se devuelva: es el costo que más se subestima en
                contraentrega. La devolución es sobre lo despachado, que es como la reporta la transportadora.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
