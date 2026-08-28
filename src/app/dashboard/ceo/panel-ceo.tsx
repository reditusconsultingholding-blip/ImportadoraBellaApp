"use client";

import { useState } from "react";
import Link from "next/link";
import PulseLine, { type PulseTone } from "../pulse-line";
import type { PanelCeo } from "@/lib/ceo";

const money = (n: number | null, dec = 0) =>
  n == null
    ? "—"
    : n.toLocaleString("es-EC", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: dec,
      });

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

const ESTADO: Record<PulseTone, { texto: string; chip: string }> = {
  SANO: { texto: "Va bien", chip: "bg-good-bg text-good border-good/30" },
  VIGILAR: { texto: "Optimizar", chip: "bg-surface-2 text-warning border-warning/30" },
  RIESGO: { texto: "Va mal", chip: "bg-critical-bg text-critical border-critical/30" },
  SIN_DATOS: { texto: "Sin pauta", chip: "bg-surface-2 text-muted border-border" },
};

type Pestana = "resumen" | "productos" | "rentabilidad" | "acciones" | "equipo" | "nomina";

const PESTANAS: { id: Pestana; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "productos", label: "Productos" },
  { id: "rentabilidad", label: "Rentabilidad" },
  { id: "acciones", label: "Qué hacer hoy" },
  { id: "equipo", label: "Equipo" },
  { id: "nomina", label: "Nómina" },
];

/** Los chips de filtro, iguales en las tres pestañas. */
function Filtros<T extends string>(
  activo: T,
  set: (v: T) => void,
  opciones: { id: T; label: string }[]
) {
  return opciones.map((o) => (
    <button
      key={o.id}
      onClick={() => set(o.id)}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        activo === o.id
          ? "border-accent bg-good-bg text-accent-strong"
          : "border-border text-muted hover:border-border-strong hover:text-foreground"
      }`}
    >
      {o.label}
    </button>
  ));
}

/**
 * Productos por cómo vienen.
 *
 * Dentro de cada grupo manda el gasto: un producto que va mal y se lleva
 * cinco dólares no es el problema del día, y uno que va bien con mucho
 * presupuesto es donde está la oportunidad.
 */
function ordenarPulsos(pulsos: PanelCeo["productos"]["pulsos"], filtro: string) {
  if (filtro === "mejores") {
    return pulsos.filter((p) => p.state === "SANO").sort((a, b) => b.spend - a.spend);
  }
  if (filtro === "peores") {
    return pulsos
      .filter((p) => p.state === "RIESGO" || p.state === "VIGILAR")
      .sort((a, b) => a.score - b.score || b.spend - a.spend);
  }
  return pulsos;
}

/** Rentabilidad: los que más dejan, o los que pierden. */
function ordenarRentabilidad(filas: PanelCeo["rentabilidad"]["filas"], filtro: string) {
  if (filtro === "mejores") {
    return filas
      .filter((f) => (f.utilidad ?? 0) > 0)
      .slice()
      .sort((a, b) => (b.utilidad ?? 0) - (a.utilidad ?? 0));
  }
  if (filtro === "peores") {
    return filas
      .filter((f) => f.utilidad != null && f.utilidad < 0)
      .slice()
      .sort((a, b) => (a.utilidad ?? 0) - (b.utilidad ?? 0));
  }
  return filas;
}

/**
 * Acciones, ordenadas por lo que está en juego.
 *
 * "Más importantes" no es lo mismo que "primeras": lo que importa es cuánta
 * plata mueve la decisión, sea para apagar o para escalar. Un producto que
 * pierde veinte dólares está antes que uno que pierde diez mil solo si se
 * ordena por tipo, y eso es exactamente lo que hay que evitar.
 */
function ordenarAlertas(alertas: PanelCeo["alertas"], filtro: string) {
  if (filtro === "apagar") {
    return alertas.filter((a) => a.tipo === "apagar").sort((a, b) => b.gasto - a.gasto);
  }
  if (filtro === "escalar") {
    return alertas.filter((a) => a.tipo === "escalar").sort((a, b) => b.gasto - a.gasto);
  }
  if (filtro === "importantes") {
    return alertas
      .filter((a) => a.tipo !== "revisar")
      .slice()
      .sort((a, b) => b.gasto - a.gasto);
  }
  return alertas;
}

function Tarjeta({
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
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${tono ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted">{nota}</p>}
    </div>
  );
}

/**
 * El panel del dueño: seis vistas del mismo negocio.
 *
 * Todo sale de los mismos módulos que alimentan el resto de la app. Si el CEO
 * viera números calculados aparte, tarde o temprano no coincidirían con los que
 * ve su equipo — y a partir de ahí nadie confía en ninguno de los dos.
 */
export default function PanelCeoVista({
  data,
  periodo,
  puedeVerNomina,
}: {
  data: PanelCeo;
  periodo: string;
  puedeVerNomina: boolean;
}) {
  const [pestana, setPestana] = useState<Pestana>("resumen");
  // Un filtro por pestaña, no uno compartido: "peores" significa cosas
  // distintas en productos y en rentabilidad, y compartirlo confundiria.
  const [filtroProductos, setFiltroProductos] = useState<"todos" | "mejores" | "peores">("todos");
  const [filtroRent, setFiltroRent] = useState<"todos" | "mejores" | "peores">("todos");
  const [filtroAcciones, setFiltroAcciones] = useState<"importantes" | "apagar" | "escalar" | "todos">(
    "importantes"
  );
  const visibles = PESTANAS.filter((p) => p.id !== "nomina" || puedeVerNomina);

  return (
    <div className="flex flex-col gap-4">
      <nav className="flex flex-wrap gap-1.5">
        {visibles.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              pestana === p.id
                ? "border-accent bg-good-bg text-accent-strong"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </nav>

      {pestana === "resumen" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta
              label="Facturado"
              valor={money(data.resumen.facturado)}
              nota={`${data.resumen.ordenes.toLocaleString("es-EC")} órdenes`}
            />
            <Tarjeta
              label="Ticket promedio"
              valor={money(data.resumen.ticket, 2)}
              nota={periodo}
            />
            <Tarjeta
              label="Gasto en pauta"
              valor={money(data.resumen.gastoPauta)}
              nota={
                data.resumen.pesoPauta == null
                  ? undefined
                  : `${pct(data.resumen.pesoPauta)} de lo facturado`
              }
              tono={
                data.resumen.pesoPauta != null && data.resumen.pesoPauta > 0.35
                  ? "text-critical"
                  : undefined
              }
            />
            <Tarjeta
              label="Utilidad estimada"
              valor={money(data.resumen.utilidadEstimada)}
              nota="después de mercadería y flete"
              tono={data.resumen.utilidadEstimada >= 0 ? "text-good" : "text-critical"}
            />
          </div>

          {data.resumen.canales.length > 0 && (
            <div className="rounded border border-border bg-surface p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Por canal de venta
              </p>
              <div className="flex flex-col gap-1.5">
                {data.resumen.canales.map((c) => (
                  <div key={c.label} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{c.label}</span>
                    <span className="shrink-0 tabular-nums">{money(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.resumen.lecturas.length > 0 && (
            <div className="rounded border border-border bg-surface p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
                Qué dicen estos números
              </p>
              <ul className="flex flex-col gap-2">
                {data.resumen.lecturas.map((l, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {pestana === "productos" && (
        <div className="rounded border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
            <p className="text-xs text-muted">
              {data.productos.pulsos.length} con pauta · {data.productos.sinPauta} sin pauta
            </p>
            <span className="ml-auto flex gap-1.5">
              {Filtros(filtroProductos, setFiltroProductos, [
                { id: "todos", label: "Todos" },
                { id: "mejores", label: "Los que van mejor" },
                { id: "peores", label: "Los que van peor" },
              ])}
            </span>
          </div>
          <div className="flex flex-col">
            {ordenarPulsos(data.productos.pulsos, filtroProductos).map((p) => (
              <Link
                key={p.productId ?? p.name}
                href={p.code ? `/dashboard/productos/${encodeURIComponent(p.code)}` : "#"}
                className="flex items-center gap-2.5 border-b border-border px-4 py-2.5 transition last:border-b-0 hover:bg-surface-2"
              >
                <PulseLine serie={p.serie} state={p.state} width={54} height={20} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs tabular-nums text-muted">
                    {money(p.spend)} · {p.cpa == null ? "sin compras" : `CPA ${money(p.cpa, 2)}`}
                    {p.cpaTarget ? ` / obj ${money(p.cpaTarget, 2)}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${ESTADO[p.state].chip}`}
                >
                  {ESTADO[p.state].texto}
                </span>
                <span className="w-7 shrink-0 text-right font-mono text-sm tabular-nums">
                  {p.score}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {pestana === "rentabilidad" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta label="Ingreso estimado" valor={money(data.rentabilidad.totales.ingreso)} />
            <Tarjeta label="Gasto en pauta" valor={money(data.rentabilidad.totales.gastoPauta)} />
            <Tarjeta
              label="Utilidad"
              valor={money(data.rentabilidad.totales.utilidad)}
              tono={data.rentabilidad.totales.utilidad >= 0 ? "text-good" : "text-critical"}
            />
            <Tarjeta
              label="Sin economía cargada"
              valor={String(data.rentabilidad.totales.sinEconomia)}
              nota="no se les puede calcular utilidad"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {Filtros(filtroRent, setFiltroRent, [
              { id: "todos", label: "Todos" },
              { id: "mejores", label: "Los que más dejan" },
              { id: "peores", label: "Los que pierden" },
            ])}
          </div>

          <div className="overflow-x-auto rounded border border-border bg-surface">
            <table className="table-cols w-full min-w-[42rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-3 py-2 font-semibold">Producto</th>
                  <th className="px-3 py-2 text-right font-semibold">Gasto</th>
                  <th className="px-3 py-2 text-right font-semibold">Ingreso</th>
                  <th className="px-3 py-2 text-right font-semibold">Utilidad</th>
                </tr>
              </thead>
              <tbody>
                {ordenarRentabilidad(data.rentabilidad.filas, filtroRent).slice(0, 25).map((f) => (
                  <tr key={f.productId} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/productos/${encodeURIComponent(f.code)}`}
                        className="hover:underline"
                      >
                        {f.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(f.gastoPauta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(f.ingreso)}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        f.utilidad == null ? "" : f.utilidad < 0 ? "text-critical" : "text-good"
                      }`}
                    >
                      {money(f.utilidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Link
            href="/dashboard/rentabilidad"
            className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            Ver el detalle completo
          </Link>
        </div>
      )}

      {pestana === "acciones" && (
        <div className="rounded border border-border bg-surface">
          {data.alertas.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
              {Filtros(filtroAcciones, setFiltroAcciones, [
                { id: "importantes", label: "Más importantes" },
                { id: "apagar", label: "Para apagar" },
                { id: "escalar", label: "Para escalar" },
                { id: "todos", label: "Todas" },
              ])}
            </div>
          )}
          {data.alertas.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              Nada urgente hoy: ningún producto está fuera de su punto de equilibrio.
            </p>
          ) : (
            <div className="flex flex-col">
              {ordenarAlertas(data.alertas, filtroAcciones).map((a) => (
                <Link
                  key={`${a.tipo}-${a.productId}`}
                  href={`/dashboard/productos/${encodeURIComponent(a.code)}`}
                  className="flex items-start gap-3 border-b border-border px-4 py-3 transition last:border-b-0 hover:bg-surface-2"
                >
                  <span
                    className={`mt-px shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      a.tipo === "apagar"
                        ? "border-critical/30 bg-critical-bg text-critical"
                        : a.tipo === "escalar"
                          ? "border-good/30 bg-good-bg text-good"
                          : "border-warning/30 bg-surface-2 text-warning"
                    }`}
                  >
                    {a.tipo === "apagar" ? "Apagar" : a.tipo === "escalar" ? "Escalar" : "Vigilar"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.name}</span>
                    <span className="block text-xs leading-relaxed text-muted">{a.mensaje}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {pestana === "equipo" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <Tarjeta label="Piezas del período" valor={String(data.equipo.totalCreativos)} />
            <Tarjeta label="Terminadas" valor={String(data.equipo.terminados)} />
            <Tarjeta
              label="Winners"
              valor={String(data.equipo.winners)}
              tono={data.equipo.winners > 0 ? "text-good" : undefined}
            />
          </div>

          <div className="overflow-x-auto rounded border border-border bg-surface">
            <table className="table-cols w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-3 py-2 font-semibold">Quién</th>
                  <th className="px-3 py-2 text-right font-semibold">Piezas</th>
                  <th className="px-3 py-2 text-right font-semibold">Terminadas</th>
                  <th className="px-3 py-2 text-right font-semibold">Winners</th>
                  <th className="px-3 py-2 text-right font-semibold">CPA medio</th>
                </tr>
              </thead>
              <tbody>
                {data.equipo.editores.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted">
                      No hay piezas cargadas en este período.
                    </td>
                  </tr>
                )}
                {data.equipo.editores.map((e) => (
                  <tr key={e.nombre} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-medium">{e.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.terminados}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.winners}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(e.cpaMedio, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted">
            El CPA medio es el de las piezas que produjo cada persona: dice si lo que hace funciona,
            no solo cuánto hace.
          </p>
        </div>
      )}

      {pestana === "nomina" && puedeVerNomina && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Tarjeta label="Pagos del período" valor={String(data.nomina.pagos)} />
            <Tarjeta label="Total pagado" valor={money(data.nomina.total)} />
          </div>
          <Link
            href="/dashboard/nomina"
            className="text-xs text-muted underline underline-offset-2 hover:text-foreground"
          >
            Ver el detalle de la nómina
          </Link>
        </div>
      )}
    </div>
  );
}
