"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CampanasDelAno } from "@/lib/ceo-campanas";
import BuscadorProducto from "../buscador-producto";

// El tablero "Campañas del año", como el que el dueño usaba en Looker Studio:
// KPIs, CPA por mes, gasto por mes, Meta contra TikTok, y las tablas por mes
// y por producto. Con los filtros de plataforma, centro de negocios y
// producto, y un rango de meses.

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
const etiquetaMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

const usd0 = (n: number) => n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => n.toLocaleString("es-EC");
const miles = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("es-EC", { maximumFractionDigits: 0 })} mil` : num(n));

type Suma = { gasto: number; conversiones: number };
const cpa = (s: Suma) => (s.conversiones > 0 ? s.gasto / s.conversiones : null);

const GASTO = "var(--chart-1)";
const CPA_COLOR = "var(--chart-3)";

// Meta y TikTok salían del MISMO color en el gráfico que las compara, así que
// la comparación no se leía: "el moradito qué es", preguntó Fabricio. Ahora
// cada plataforma tiene el suyo y se dice cuál es cuál debajo del gráfico.
const META_COLOR = "var(--chart-2)";
const TIKTOK_COLOR = "var(--chart-3)";
const colorDe = (nombre: string) => (nombre.startsWith("Meta") ? META_COLOR : TIKTOK_COLOR);

// El tooltip es lo que se mira al pasar el cursor, y estaba heredando el gris
// por defecto de la librería: sobre el fondo oscuro no se leía, y parecía que
// "no daba el valor". Se le pone el color del texto de la app y un realce en
// la columna, para que además se vea que el cursor está haciendo algo.
const CAJA_TOOLTIP = {
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  borderRadius: 6,
  fontSize: 12,
  color: "var(--foreground)",
  boxShadow: "var(--shadow-pop)",
} as const;
const TEXTO_TOOLTIP = { color: "var(--foreground)" } as const;
const ETIQUETA_TOOLTIP = { color: "var(--muted)", fontSize: 11 } as const;
const REALCE = { fill: "var(--chart-grid)", fillOpacity: 0.55 } as const;

function Kpi({ label, valor, nota }: { label: string; valor: string; nota?: string }) {
  return (
    <div className="rounded border border-border bg-surface-2/50 px-4 py-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="mt-1 break-all text-[20px] font-semibold tabular-nums leading-tight text-foreground xl:text-[24px]">{valor}</p>
      {nota && <p className="mt-1 text-[11px] text-muted">{nota}</p>}
    </div>
  );
}

function Caja({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-border bg-surface p-4 ${className}`}>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-foreground/90">{titulo}</h3>
      {children}
    </section>
  );
}

const claseSelect =
  "rounded border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-accent";

export default function CampanasAno() {
  const [anio, setAnio] = useState(new Date().getUTCFullYear());
  const [datos, setDatos] = useState<CampanasDelAno | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [plataforma, setPlataforma] = useState<"" | "META" | "TIKTOK">("");
  const [centro, setCentro] = useState("");
  const [producto, setProducto] = useState("");
  const [desdeMes, setDesdeMes] = useState("");
  const [hastaMes, setHastaMes] = useState("");
  const [ordenProducto, setOrdenProducto] = useState<"gasto" | "conversiones" | "cpa">("gasto");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/ceo/campanas?anio=${anio}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`El servidor respondió ${r.status}`))))
      .then((d: CampanasDelAno) => {
        if (!vivo) return;
        setDatos(d);
        setError(null);
      })
      .catch((e) => vivo && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      vivo = false;
    };
  }, [anio]);

  const cuentaDe = useMemo(() => new Map((datos?.cuentas ?? []).map((c) => [c.id, c])), [datos]);
  const productoDe = useMemo(() => new Map((datos?.productos ?? []).map((p) => [p.id, p])), [datos]);
  const centros = useMemo(
    () =>
      [...new Set((datos?.cuentas ?? []).filter((c) => !plataforma || c.plataforma === plataforma).map((c) => c.centro))].sort(),
    [datos, plataforma],
  );
  const mesesDisponibles = useMemo(() => [...new Set((datos?.filas ?? []).map((f) => f.mes))].sort(), [datos]);

  // Las filas que pasan los filtros. Todo lo de abajo sale de acá.
  const filas = useMemo(() => {
    if (!datos) return [];
    return datos.filas.filter((f) => {
      if (plataforma && f.plataforma !== plataforma) return false;
      if (centro && cuentaDe.get(f.cuentaId)?.centro !== centro) return false;
      if (producto && f.productoId !== producto) return false;
      if (desdeMes && f.mes < desdeMes) return false;
      if (hastaMes && f.mes > hastaMes) return false;
      return true;
    });
  }, [datos, plataforma, centro, producto, desdeMes, hastaMes, cuentaDe]);

  const total = useMemo(
    () => filas.reduce((s, f) => ({ gasto: s.gasto + f.gasto, conversiones: s.conversiones + f.conversiones }), { gasto: 0, conversiones: 0 }),
    [filas],
  );

  const porMes = useMemo(() => {
    const m = new Map<string, Suma>();
    for (const f of filas) {
      const s = m.get(f.mes) ?? { gasto: 0, conversiones: 0 };
      s.gasto += f.gasto;
      s.conversiones += f.conversiones;
      m.set(f.mes, s);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mes, s]) => ({ mes, etiqueta: etiquetaMes(mes), ...s, cpa: cpa(s) }));
  }, [filas]);

  const porPlataforma = useMemo(() => {
    const m = new Map<string, Suma>();
    for (const f of filas) {
      const s = m.get(f.plataforma) ?? { gasto: 0, conversiones: 0 };
      s.gasto += f.gasto;
      s.conversiones += f.conversiones;
      m.set(f.plataforma, s);
    }
    return (["META", "TIKTOK"] as const)
      .filter((p) => m.has(p))
      .map((p) => {
        const s = m.get(p)!;
        return { nombre: `${p === "META" ? "Meta Ads" : "TikTok"} ${anio}`, ...s, cpa: cpa(s) };
      });
  }, [filas, anio]);

  const porProducto = useMemo(() => {
    const m = new Map<string, Suma>();
    for (const f of filas) {
      const k = f.productoId ?? "__sin__";
      const s = m.get(k) ?? { gasto: 0, conversiones: 0 };
      s.gasto += f.gasto;
      s.conversiones += f.conversiones;
      m.set(k, s);
    }
    return [...m.entries()]
      .map(([id, s]) => {
        const p = productoDe.get(id);
        return {
          id,
          codigo: p?.codigo ?? "—",
          nombre: p?.nombre ?? "Campañas sin producto asignado",
          ...s,
          cpa: cpa(s),
        };
      })
      .sort((a, b) =>
        ordenProducto === "cpa"
          ? (a.cpa ?? Infinity) - (b.cpa ?? Infinity)
          : ordenProducto === "conversiones"
            ? b.conversiones - a.conversiones
            : b.gasto - a.gasto,
      );
  }, [filas, productoDe, ordenProducto]);

  if (error) return <p className="rounded border border-critical bg-critical-bg px-4 py-3 text-sm text-critical">{error}</p>;
  if (!datos) return <p className="py-8 text-center text-sm text-muted">Cargando las campañas del año…</p>;

  const hayFiltro = Boolean(plataforma || centro || producto || desdeMes || hastaMes);
  const eje = { fontSize: 10, fill: "var(--muted)" };

  return (
    <div className="flex flex-col gap-4">
      {/* La barra de filtros, como la del Looker. */}
      <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface px-4 py-3">
        <span className="mr-1 text-sm font-semibold text-foreground">Filtros</span>
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className={claseSelect} aria-label="Año">
          {(datos.aniosDisponibles.length ? datos.aniosDisponibles : [anio]).map((a) => (
            <option key={a} value={a}>
              Campañas {a}
            </option>
          ))}
        </select>
        <select
          value={plataforma}
          onChange={(e) => {
            setPlataforma(e.target.value as "" | "META" | "TIKTOK");
            setCentro("");
          }}
          className={claseSelect}
          aria-label="Plataforma"
        >
          <option value="">Todas las plataformas</option>
          <option value="META">Meta Ads</option>
          <option value="TIKTOK">TikTok</option>
        </select>
        <select value={centro} onChange={(e) => setCentro(e.target.value)} className={claseSelect} aria-label="Centro de negocios">
          <option value="">Todos los centros de negocios</option>
          {centros.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <BuscadorProducto
          opciones={datos.productos.map((p) => ({ id: p.id, nombre: p.nombre, codigo: p.codigo }))}
          valor={producto}
          onElegir={setProducto}
          vacio="Todos los productos"
          ariaLabel="Producto"
          className="min-w-[240px]"
        />
        <select value={desdeMes} onChange={(e) => setDesdeMes(e.target.value)} className={claseSelect} aria-label="Desde el mes">
          <option value="">Desde el primer mes</option>
          {mesesDisponibles.map((m) => (
            <option key={m} value={m}>
              desde {etiquetaMes(m)}
            </option>
          ))}
        </select>
        <select value={hastaMes} onChange={(e) => setHastaMes(e.target.value)} className={claseSelect} aria-label="Hasta el mes">
          <option value="">Hasta el último mes</option>
          {mesesDisponibles.map((m) => (
            <option key={m} value={m}>
              hasta {etiquetaMes(m)}
            </option>
          ))}
        </select>
        {hayFiltro && (
          <button
            type="button"
            onClick={() => {
              setPlataforma("");
              setCentro("");
              setProducto("");
              setDesdeMes("");
              setHastaMes("");
            }}
            className="text-xs text-muted underline hover:text-foreground"
          >
            Quitar filtros
          </button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <Caja titulo="KPI's">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="Gasto total" valor={usd0(total.gasto)} />
            <Kpi label="CPA real (costo por conv.)" valor={usd2(cpa(total))} />
            <Kpi label="Conversiones totales" valor={num(total.conversiones)} nota="las que reportan Meta y TikTok" />
          </div>
        </Caja>

        <Caja titulo="CPA real (costo por conv.) a lo largo del tiempo">
          <div className="h-[210px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={porMes} margin={{ top: 18, right: 18, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="etiqueta" tick={eje} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tick={eje} axisLine={false} tickLine={false} domain={[0, "auto"]} />
                <Tooltip
                  formatter={(v) => [usd2(Number(v)), "CPA"]}
                  contentStyle={CAJA_TOOLTIP}
                  itemStyle={TEXTO_TOOLTIP}
                  labelStyle={ETIQUETA_TOOLTIP}
                  cursor={REALCE}
                />
                <Line type="monotone" dataKey="cpa" stroke={CPA_COLOR} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                  <LabelList dataKey="cpa" position="top" formatter={(v: unknown) => usd2(Number(v))} style={{ fontSize: 10, fill: "var(--muted)" }} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Caja>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <Caja titulo="Meta contra TikTok">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={porPlataforma} margin={{ top: 18, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="nombre" tick={eje} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis tick={eje} axisLine={false} tickLine={false} tickFormatter={(v) => miles(Number(v))} />
                <Tooltip
                  formatter={(v, n) => [n === "Gasto total" ? usd0(Number(v)) : num(Number(v)), n]}
                  contentStyle={CAJA_TOOLTIP}
                  itemStyle={TEXTO_TOOLTIP}
                  labelStyle={ETIQUETA_TOOLTIP}
                  cursor={REALCE}
                />
                {/* Una barra por plataforma, cada una de su color. El
                    relleno se pone por celda y no por serie porque las dos
                    barras son la MISMA medida de dos plataformas distintas:
                    pintarlas iguales es lo que hacía que no se distinguieran. */}
                <Bar dataKey="gasto" name="Gasto total" isAnimationActive={false}>
                  {porPlataforma.map((d) => (
                    <Cell key={d.nombre} fill={colorDe(d.nombre)} />
                  ))}
                  <LabelList dataKey="gasto" position="insideTop" formatter={(v: unknown) => usd0(Number(v))} style={{ fontSize: 10, fill: "#fff" }} />
                </Bar>
                <Bar dataKey="conversiones" name="Conversiones" isAnimationActive={false}>
                  {porPlataforma.map((d) => (
                    <Cell key={d.nombre} fill={colorDe(d.nombre)} fillOpacity={0.55} />
                  ))}
                  <LabelList dataKey="conversiones" position="top" formatter={(v: unknown) => num(Number(v))} style={{ fontSize: 10, fill: "var(--muted)" }} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {/* Cuál color es cuál, y cuál barra es cuál.
              Reemplaza a la leyenda de la librería, que después de pintar por
              celda se quedó sin color y dibujaba cuadraditos negros sobre el
              fondo oscuro. Escrito así además dice algo que la leyenda no
              podía: que el color es la PLATAFORMA y el tono es la medida. */}
          <p className="mt-2 text-[11px] text-muted">
            Barra llena, el gasto. Barra clara, las conversiones.
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
            {porPlataforma.map((p) => (
              <p key={p.nombre} className="flex items-center gap-1.5 text-muted">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: colorDe(p.nombre) }}
                />
                {p.nombre}: <b className="text-foreground">CPA {usd2(p.cpa)}</b>
              </p>
            ))}
          </div>
        </Caja>

        <Caja titulo="Gasto total por año y mes">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={porMes} margin={{ top: 22, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="etiqueta" tick={eje} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis yAxisId="g" tick={eje} axisLine={false} tickLine={false} tickFormatter={(v) => miles(Number(v))} />
                <YAxis yAxisId="c" orientation="right" hide />
                <Tooltip
                  formatter={(v, n) => [n === "Gasto total" ? usd0(Number(v)) : n === "CPA" ? usd2(Number(v)) : num(Number(v)), n]}
                  contentStyle={CAJA_TOOLTIP}
                  itemStyle={TEXTO_TOOLTIP}
                  labelStyle={ETIQUETA_TOOLTIP}
                  cursor={REALCE}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="g" dataKey="gasto" name="Gasto total" fill={GASTO} isAnimationActive={false}>
                  <LabelList dataKey="gasto" position="insideTop" formatter={(v: unknown) => usd0(Number(v))} style={{ fontSize: 9, fill: "#fff" }} />
                  <LabelList
                    dataKey="conversiones"
                    position="top"
                    formatter={(v: unknown) => num(Number(v))}
                    style={{ fontSize: 9, fill: "var(--foreground)" }}
                  />
                </Bar>
                {/* El CPA estaba dibujado como etiqueta de una línea invisible,
                    "abajo" de un eje escondido: en los meses de CPA alto esa
                    etiqueta caía ENCIMA de la barra verde, en gris, y no se
                    leía. No se le cambió el color —taparía el problema y
                    seguiría pisando el número de adentro—: se sacó. El CPA de
                    cada mes ya está en su propio gráfico, acá arriba, y en la
                    tabla de abajo; acá era una tercera copia que además
                    estorbaba. Sigue estando en el tooltip al pasar el cursor. */}
                <Line
                  yAxisId="c"
                  type="monotone"
                  dataKey="cpa"
                  name="CPA"
                  stroke={CPA_COLOR}
                  strokeWidth={0}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  // La línea existe solo para que el CPA salga en el tooltip; sin
                  // esto la leyenda anunciaba un "CPA" que no se dibuja en
                  // ningún lado.
                  legendType="none"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[10px] text-muted">
            Arriba de cada barra, las conversiones del mes; adentro, el gasto. El CPA de cada
            mes está en el gráfico de arriba y en la tabla, y aparece al pasar el cursor.
          </p>
        </Caja>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Caja titulo="Gasto total de todas las plataformas">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-accent/90 text-left text-[11px] font-semibold text-white [&>th]:text-white">
                  <th className="px-3 py-2">Año y mes</th>
                  <th className="px-3 py-2 text-right">Conversiones</th>
                  <th className="px-3 py-2 text-right">Gasto total</th>
                  <th className="px-3 py-2 text-right">CPA real</th>
                </tr>
              </thead>
              <tbody>
                {porMes.map((m, i) => (
                  <tr key={m.mes} className={i % 2 ? "bg-surface-2/40" : ""}>
                    <td className="px-3 py-1.5 text-foreground">{m.etiqueta}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(m.conversiones)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{usd2(m.gasto)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{usd2(m.cpa)}</td>
                  </tr>
                ))}
                <tr className="border-t border-border font-semibold">
                  <td className="px-3 py-1.5">Total</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{num(total.conversiones)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{usd2(total.gasto)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{usd2(cpa(total))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Caja>

        <Caja titulo="CPA por producto">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-accent/90 text-left text-[11px] font-semibold text-white [&>th]:text-white">
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Producto</th>
                  {(
                    [
                      ["conversiones", "Conversiones"],
                      ["gasto", "Gasto total"],
                      ["cpa", "CPA real"],
                    ] as const
                  ).map(([id, texto]) => (
                    <th key={id} className="px-3 py-2 text-right">
                      <button type="button" onClick={() => setOrdenProducto(id)} className="font-semibold hover:underline">
                        {texto}
                        {ordenProducto === id ? (id === "cpa" ? " ▲" : " ▼") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {porProducto.map((p, i) => (
                  <tr key={p.id} className={i % 2 ? "bg-surface-2/40" : ""}>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">{p.codigo}</td>
                    <td className="max-w-[240px] truncate px-3 py-1.5 text-foreground" title={p.nombre}>
                      {p.nombre}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{num(p.conversiones)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{usd0(p.gasto)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{usd2(p.cpa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Caja>
      </div>

      <p className="text-[11px] leading-relaxed text-muted">
        Conversiones = las compras que reportan Meta y TikTok, igual que en Looker Studio. El CPA contra las ventas reales
        de la tienda está en el Panel y en Origen de las ventas. Los datos se actualizan cada 2 minutos desde Windsor.
      </p>
    </div>
  );
}
