"use client";

import { useMemo, useState } from "react";

type Product = { name: string; cpa: number; operatingExpensePerOrder: number };

const money = (n: number) =>
  isFinite(n) ? n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 }) : "—";

export default function PricingCalculator({ products }: { products: Product[] }) {
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

  function loadFromProduct(name: string) {
    setSelectedProduct(name);
    const p = products.find((x) => x.name === name);
    if (p) {
      setAdSpend(p.cpa.toFixed(2));
      setOperatingCost(p.operatingExpensePerOrder.toFixed(2));
    }
  }

  const result = useMemo(() => {
    const cost = (Number(productCost) || 0) + (Number(shippingCost) || 0) + (Number(operatingCost) || 0) + (Number(adSpend) || 0);
    const iva = (Number(ivaPct) || 0) / 100;
    const gateway = (Number(gatewayFeePct) || 0) / 100;
    const denomBase = 1 / (1 + iva) - gateway;

    let price: number;
    if (mode === "fixed") {
      const target = Number(fixedProfit) || 0;
      price = denomBase > 0 ? (target + cost) / denomBase : NaN;
    } else {
      const margin = (Number(marginPct) || 0) / 100;
      const denom = denomBase - margin;
      price = denom > 0 ? cost / denom : NaN;
    }

    if (!isFinite(price) || price <= 0) {
      return { valid: false as const, cost };
    }

    const revenueBeforeIva = price / (1 + iva);
    const ivaAmount = price - revenueBeforeIva;
    const gatewayAmount = price * gateway;
    const profit = revenueBeforeIva - gatewayAmount - cost;
    const marginOfPrice = price > 0 ? (profit / price) * 100 : 0;
    const roundedUp = Math.ceil(price) - 0.01; // ej. $24.99
    const roundedWhole = Math.ceil(price);

    return {
      valid: true as const,
      cost,
      price,
      ivaAmount,
      gatewayAmount,
      profit,
      marginOfPrice,
      roundedUp,
      roundedWhole,
    };
  }, [productCost, shippingCost, operatingCost, adSpend, gatewayFeePct, ivaPct, mode, marginPct, fixedProfit]);

  const inputClass =
    "w-full bg-transparent border border-border rounded px-3 py-2 outline-none focus:border-accent tabular-nums";
  const labelClass = "block text-xs font-mono uppercase tracking-wide text-muted mb-1";

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-surface border border-border rounded p-5 flex flex-col gap-4">
        <h2 className="font-semibold text-sm">Costos por pedido</h2>

        {products.length > 0 && (
          <label className="block">
            <span className={labelClass}>Cargar CPA / gasto operativo desde un producto (opcional)</span>
            <select
              value={selectedProduct}
              onChange={(e) => loadFromProduct(e.target.value)}
              className={inputClass}
            >
              <option value="">— Elegir producto —</option>
              {products.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
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
            <span className={labelClass}>Publicidad (CPA objetivo)</span>
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

        <div className="pt-2 border-t border-border">
          <h2 className="font-semibold text-sm mb-3">¿Qué querés lograr?</h2>
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
                <span className="text-muted">Costos (producto + envío + operativo + pauta)</span>
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
                <span>Ganancia neta por pedido</span>
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
  );
}
