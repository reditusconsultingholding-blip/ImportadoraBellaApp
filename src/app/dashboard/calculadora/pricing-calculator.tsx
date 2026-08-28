"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Lo que se guarda por producto, compartido con todo el equipo. Son todos
// strings porque es lo que hay en los campos: convertir al guardar y volver a
// formatear al leer solo agrega formas de perder un decimal.
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
  /** Notas del analisis, para que otro entienda por que quedaron esos numeros. */
  nota?: string;
};

// Producto que se puede cargar de un clic: precio y costo salen de Shopify en
// vivo (unitCost por variante), CPA y gasto operativo de Rentabilidad.
export type CalcProduct = {
  name: string;
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

const money = (n: number) =>
  isFinite(n) ? n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) : "—";

const pct = (n: number) => (isFinite(n) ? `${(n * 100).toFixed(1)}%` : "—");

const num = (v: string) => Number(v) || 0;

// --- El modelo de la operación real --------------------------------------
//
// Portado del sistema en producción (ver docs/REFERENCIA_SISTEMA_RAILWAY.md).
// La idea central: de cada checkout que paga Meta, solo una parte se confirma
// y de esa parte una porción se devuelve. Lo que de verdad se cobra es
// `delivered = confirmación × (1 − devolución)`, y todos los números cuelgan
// de ahí. Aquí se le suma lo que el sistema viejo no tenía: IVA y comisión de
// pasarela, que en Ecuador se descuentan del precio antes de ver la ganancia.

type OperationInput = {
  aov: number;
  cogs: number;
  flete: number;
  admin: number;
  cpa: number;
  conf: number; // 0–1
  dev: number; // 0–1
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
  const breakevenCpa =
    netPerDelivered * delivered - i.cogs * delivered - i.flete * i.conf - i.admin * delivered;
  const idealCpa = breakevenCpa - i.targetProfitPct * i.aov * delivered;

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
    deliveriesPerDay,
    dailyProfit,
    adInvestment,
    ecpa,
    roas,
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

export default function PricingCalculator({ products }: { products: CalcProduct[] }) {
  const [productCost, setProductCost] = useState("8");
  const [shippingCost, setShippingCost] = useState("3.5");
  const [operatingCost, setOperatingCost] = useState("2");
  const [adSpend, setAdSpend] = useState("6");
  const [gatewayFeePct, setGatewayFeePct] = useState("4");
  const [ivaPct, setIvaPct] = useState("15");
  const [mode, setMode] = useState<"margin" | "fixed">("margin");
  const [marginPct, setMarginPct] = useState("25");
  const [fixedProfit, setFixedProfit] = useState("6");
  const [selectedProduct, setSelectedProduct] = useState("");

  // Realidad de la operación (lo que agrega esta versión).
  const [confirmationPct, setConfirmationPct] = useState("80");
  const [returnPct, setReturnPct] = useState("8");
  const [ordersPerDay, setOrdersPerDay] = useState("20");
  const [adjustForDelivery, setAdjustForDelivery] = useState(true);
  const [priceOverride, setPriceOverride] = useState("");

  // Los ajustes guardados por producto, compartidos con todo el equipo. Se
  // leen una vez al abrir la pantalla y se guardan solos al cambiar algo.
  const ajustesRef = useRef<Record<string, Partial<Ajuste>>>({});
  const [ajustesListos, setAjustesListos] = useState(false);
  const [guardado, setGuardado] = useState<"limpio" | "guardando" | "guardado">("limpio");
  const [nota, setNota] = useState("");

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
    setSelectedProduct(name);
    const p = products.find((x) => x.name === name);
    if (!p) return;

    // Primero lo que sabe Shopify y Rentabilidad…
    if (p.cpa != null) setAdSpend(p.cpa.toFixed(2));
    if (p.operatingExpensePerOrder != null) setOperatingCost(p.operatingExpensePerOrder.toFixed(2));
    if (p.unitCost != null) setProductCost(p.unitCost.toFixed(2));
    if (p.price != null) setPriceOverride(p.price.toFixed(2));
    if (p.flete != null) setShippingCost(p.flete.toFixed(2));
    if (p.efectividad != null) setConfirmationPct((p.efectividad * 100).toFixed(0));
    if (p.devoluciones != null) setReturnPct((p.devoluciones * 100).toFixed(0));

    // …y encima lo que el equipo ya ajustó a mano, que le gana: si alguien
    // corrigió el flete real de este producto, ese dato vale más que el
    // valor por defecto.
    const guardadoDelProducto = ajustesRef.current[name];
    if (!guardadoDelProducto) return;
    const g = guardadoDelProducto;
    if (g.productCost != null) setProductCost(g.productCost);
    if (g.shippingCost != null) setShippingCost(g.shippingCost);
    if (g.operatingCost != null) setOperatingCost(g.operatingCost);
    if (g.adSpend != null) setAdSpend(g.adSpend);
    if (g.gatewayFeePct != null) setGatewayFeePct(g.gatewayFeePct);
    if (g.ivaPct != null) setIvaPct(g.ivaPct);
    if (g.mode === "margin" || g.mode === "fixed") setMode(g.mode);
    if (g.marginPct != null) setMarginPct(g.marginPct);
    if (g.fixedProfit != null) setFixedProfit(g.fixedProfit);
    if (g.confirmationPct != null) setConfirmationPct(g.confirmationPct);
    if (g.returnPct != null) setReturnPct(g.returnPct);
    if (g.ordersPerDay != null) setOrdersPerDay(g.ordersPerDay);
    if (typeof g.adjustForDelivery === "boolean") setAdjustForDelivery(g.adjustForDelivery);
    if (g.priceOverride != null) setPriceOverride(g.priceOverride);
    setNota(typeof g.nota === "string" ? g.nota : "");
  }

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
    ]
  );

  // Guardado a mano. El automático ya guarda, pero sin un botón nadie sabe si
  // lo que ajustó quedó: se ve un texto que dice "guardado" y se duda igual.
  // Además deja escribir una nota, que es lo que convierte un puñado de
  // números en un análisis que alguien más puede leer después.
  async function guardarAhora() {
    if (!selectedProduct) return;
    setGuardado("guardando");
    try {
      const res = await fetch("/api/calculadora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: selectedProduct, data: { ...valores, nota } }),
      });
      if (res.ok) {
        ajustesRef.current[selectedProduct] = { ...valores, nota };
        setGuardado("guardado");
      } else {
        setGuardado("limpio");
      }
    } catch {
      setGuardado("limpio");
    }
  }

  // Guardado automático con espera: mover un campo dispara un cambio por
  // tecla, y no hay por qué escribir la base en cada una.
  useEffect(() => {
    if (!selectedProduct || !ajustesListos) return;
    const t = setTimeout(() => {
      setGuardado("guardando");
      fetch("/api/calculadora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ producto: selectedProduct, data: valores }),
      })
        .then((r) => {
          if (r.ok) ajustesRef.current[selectedProduct] = valores;
          setGuardado(r.ok ? "guardado" : "limpio");
        })
        .catch(() => setGuardado("limpio"));
    }, 700);
    return () => clearTimeout(t);
  }, [valores, selectedProduct, ajustesListos]);

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
    // gasto operativo solo pesan sobre lo entregado. Con confirmación 100% y
    // devolución 0% esto da exactamente el costo simple de antes.
    const conf_ = adjustForDelivery ? conf : 1;
    const cost =
      delivered > 0
        ? cogs + admin + (flete * conf_ + cpa) / delivered
        : Infinity;

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
  }, [
    productCost,
    shippingCost,
    operatingCost,
    adSpend,
    gatewayFeePct,
    ivaPct,
    mode,
    marginPct,
    fixedProfit,
    adjustForDelivery,
    conf,
    delivered,
  ]);

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
        note: "qué pasa si el call center confirma 10 puntos más",
      },
      {
        name: "Packs (AOV +40% / costo +60%)",
        input: { ...base, aov: base.aov * 1.4, cogs: base.cogs * 1.6 },
        note: "vender de a dos o tres unidades",
      },
      {
        name: "CPA −20%",
        input: { ...base, cpa: base.cpa * 0.8 },
        note: "si la pauta mejora un 20%",
      },
    ].map((s) => ({ ...s, out: computeOperation(s.input) }));

    return { base, current: scenarios[0].out, scenarios };
  }, [
    aov,
    productCost,
    shippingCost,
    operatingCost,
    adSpend,
    conf,
    dev,
    ordersPerDay,
    ivaPct,
    gatewayFeePct,
    mode,
    marginPct,
  ]);

  const status = verdict(num(adSpend), analysis.current);
  const statusClass =
    status.tone === "good"
      ? "bg-good-bg text-good"
      : status.tone === "warn"
        ? "bg-pending-bg text-accent-strong"
        : "bg-critical-bg text-critical";

  const inputClass =
    "w-full bg-transparent border border-border rounded px-3 py-2 outline-none focus:border-accent tabular-nums";
  const labelClass = "block text-xs font-mono uppercase tracking-wide text-muted mb-1";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-sm">Costos por pedido</h2>

          {products.length > 0 && (
            <label className="block">
              <span className={labelClass}>Cargar datos de un producto (opcional)</span>
              <select
                value={selectedProduct}
                onChange={(e) => loadFromProduct(e.target.value)}
                className={inputClass}
              >
                <option value="">— Elegir producto —</option>
                {products.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                    {p.unitCost != null ? ` · costo ${p.unitCost.toFixed(2)}` : ""}
                  </option>
                ))}
              </select>
              {selectedProduct && (
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    value={nota}
                    onChange={(e) => setNota(e.target.value)}
                    placeholder="Notas del análisis: qué se probó, qué conviene hacer…"
                    rows={2}
                    className="w-full resize-none rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={guardarAhora}
                      disabled={guardado === "guardando"}
                      className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-40"
                    >
                      {guardado === "guardando" ? "Guardando…" : "Guardar análisis"}
                    </button>
                    <span className="text-xs text-muted">
                      {guardado === "guardado"
                        ? "Guardado — todo el equipo ve estos valores."
                        : "Se guarda solo, pero puedes forzarlo aquí."}
                    </span>
                  </div>
                </div>
              )}
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Costo del producto</span>
              <input className={inputClass} type="number" value={productCost} onChange={(e) => setProductCost(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Envío / flete</span>
              <input className={inputClass} type="number" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Gasto operativo</span>
              <input className={inputClass} type="number" value={operatingCost} onChange={(e) => setOperatingCost(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Publicidad (CPA por checkout)</span>
              <input className={inputClass} type="number" value={adSpend} onChange={(e) => setAdSpend(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Comisión pasarela (%)</span>
              <input className={inputClass} type="number" value={gatewayFeePct} onChange={(e) => setGatewayFeePct(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>IVA (%)</span>
              <input className={inputClass} type="number" value={ivaPct} onChange={(e) => setIvaPct(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-muted">
            Comisión de pasarela e IVA vienen con valores típicos de Ecuador (15% IVA, ~4% pasarelas como Datafast /
            PlacetoPay / PayPhone) — ajustalos a los reales de tu cuenta si son distintos.
          </p>

          <div className="pt-3 border-t border-border flex flex-col gap-3">
            <div>
              <h2 className="font-semibold text-sm">Realidad de la operación</h2>
              <p className="text-xs text-muted mt-1">
                No todo checkout se cobra: parte no se confirma y parte se devuelve. Esto es lo que separa el CPA que
                muestra Meta del costo real de una venta cobrada.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className={labelClass}>Confirmación (%)</span>
                <input className={inputClass} type="number" value={confirmationPct} onChange={(e) => setConfirmationPct(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>Devolución (%)</span>
                <input className={inputClass} type="number" value={returnPct} onChange={(e) => setReturnPct(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>Checkouts por día</span>
                <input className={inputClass} type="number" value={ordersPerDay} onChange={(e) => setOrdersPerDay(e.target.value)} />
              </label>
            </div>
            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={adjustForDelivery}
                onChange={(e) => setAdjustForDelivery(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Ajustar el precio sugerido por confirmación y devoluciones — el flete de los paquetes que vuelven y la
                pauta de los checkouts que no se confirman los terminan pagando las ventas que sí se cobran.
              </span>
            </label>
          </div>

          <div className="pt-3 border-t border-border">
            <h2 className="font-semibold text-sm mb-3">¿Qué quieres lograr?</h2>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setMode("margin")}
                className={`text-xs font-mono uppercase tracking-wide px-3 py-1.5 rounded ${
                  mode === "margin" ? "bg-accent text-white" : "bg-surface-2 text-muted"
                }`}
              >
                Margen %
              </button>
              <button
                onClick={() => setMode("fixed")}
                className={`text-xs font-mono uppercase tracking-wide px-3 py-1.5 rounded ${
                  mode === "fixed" ? "bg-accent text-white" : "bg-surface-2 text-muted"
                }`}
              >
                Ganancia fija ($)
              </button>
            </div>
            {mode === "margin" ? (
              <label className="block">
                <span className={labelClass}>Margen deseado sobre el precio de venta (%)</span>
                <input className={inputClass} type="number" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
              </label>
            ) : (
              <label className="block">
                <span className={labelClass}>Ganancia deseada por pedido ($)</span>
                <input className={inputClass} type="number" value={fixedProfit} onChange={(e) => setFixedProfit(e.target.value)} />
              </label>
            )}
          </div>
        </div>

        <div className="bg-surface border border-border rounded p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-sm">Precio sugerido</h2>
          {!result.valid ? (
            <p className="text-sm text-critical">
              Con esos porcentajes de comisión + IVA + margen no da un precio positivo — bajá el margen objetivo o la
              comisión de pasarela.
            </p>
          ) : (
            <>
              <div className="text-center py-4">
                <p className="text-4xl font-bold tabular-nums">{money(result.price)}</p>
                <p className="text-xs text-muted mt-1">precio exacto (IVA incluido)</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-surface-2 rounded p-3">
                  <p className="text-lg font-semibold tabular-nums">{money(result.roundedWhole)}</p>
                  <p className="text-xs text-muted">redondeado a $ entero</p>
                </div>
                <div className="bg-surface-2 rounded p-3">
                  <p className="text-lg font-semibold tabular-nums">{money(result.roundedUp)}</p>
                  <p className="text-xs text-muted">estilo $X.99</p>
                </div>
              </div>

              <div className="pt-2 border-t border-border flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">
                    Costos por venta cobrada{adjustForDelivery ? " (ajustados por entrega)" : ""}
                  </span>
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
                <div className="flex justify-between font-semibold pt-2 border-t border-border">
                  <span>Ganancia neta por venta cobrada</span>
                  <span className={`tabular-nums ${result.profit >= 0 ? "text-good" : "text-critical"}`}>
                    {money(result.profit)}
                  </span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Margen efectivo sobre el precio</span>
                  <span className="tabular-nums">{result.marginOfPrice.toFixed(1)}%</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- Análisis de la operación con el precio elegido ----------------- */}
      <div className="bg-surface border border-border rounded p-5 flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-sm">Rentabilidad real de la operación</h2>
            <p className="text-xs text-muted mt-1">
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
                onChange={(e) => setPriceOverride(e.target.value)}
              />
              <span className="block text-xs text-muted mt-1">
                vacío = el precio sugerido de arriba
              </span>
            </label>
            <span className={`font-mono text-xs px-3 py-1.5 rounded ${statusClass}`}>{status.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface-2 rounded p-3">
            <p className="text-xs text-muted">CPA breakeven</p>
            <p className="text-xl font-semibold tabular-nums">{money(analysis.current.breakevenCpa)}</p>
            <p className="text-xs text-muted mt-1">arriba de esto se pierde plata</p>
          </div>
          <div className="bg-surface-2 rounded p-3">
            <p className="text-xs text-muted">CPA ideal</p>
            <p className="text-xl font-semibold tabular-nums">{money(analysis.current.idealCpa)}</p>
            <p className="text-xs text-muted mt-1">
              {mode === "margin" ? `con ${marginPct}% de margen objetivo` : "definí un margen % para calcularlo"}
            </p>
          </div>
          <div className="bg-surface-2 rounded p-3">
            <p className="text-xs text-muted">Costo real por venta (eCPA)</p>
            <p className="text-xl font-semibold tabular-nums">{money(analysis.current.ecpa)}</p>
            <p className="text-xs text-muted mt-1">el CPA de Meta ÷ {pct(delivered)}</p>
          </div>
          <div className="bg-surface-2 rounded p-3">
            <p className="text-xs text-muted">ROAS</p>
            <p className="text-xl font-semibold tabular-nums">
              {isFinite(analysis.current.roas) ? analysis.current.roas.toFixed(2) : "—"}
            </p>
            <p className="text-xs text-muted mt-1">sobre ventas entregadas</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between md:block">
            <span className="text-muted text-xs">Contribución por checkout</span>
            <p
              className={`tabular-nums font-semibold ${
                analysis.current.contribution >= 0 ? "text-good" : "text-critical"
              }`}
            >
              {money(analysis.current.contribution)}
            </p>
          </div>
          <div className="flex justify-between md:block">
            <span className="text-muted text-xs">Entregas por día</span>
            <p className="tabular-nums font-semibold">{analysis.current.deliveriesPerDay.toFixed(1)}</p>
          </div>
          <div className="flex justify-between md:block">
            <span className="text-muted text-xs">Inversión diaria en pauta</span>
            <p className="tabular-nums font-semibold">{money(analysis.current.adInvestment)}</p>
          </div>
          <div className="flex justify-between md:block">
            <span className="text-muted text-xs">Utilidad diaria</span>
            <p
              className={`tabular-nums font-semibold ${
                analysis.current.dailyProfit >= 0 ? "text-good" : "text-critical"
              }`}
            >
              {money(analysis.current.dailyProfit)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-wide text-muted">
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
                    {s.note && <span className="block text-xs text-muted font-normal">{s.note}</span>}
                  </td>
                  <td
                    className={`py-2 pr-4 text-right tabular-nums ${
                      s.out.contribution >= 0 ? "text-good" : "text-critical"
                    }`}
                  >
                    {money(s.out.contribution)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(s.out.dailyProfit)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(s.out.ecpa)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{money(s.out.breakevenCpa)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {isFinite(s.out.roas) ? s.out.roas.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
