"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ControlPeriodo, FilaControl, FilaPeriodo } from "@/lib/control-opciones";
import { ETIQUETA_HORA, ETIQUETA_SIN_ASIGNAR, HORAS_CORTE } from "@/lib/control-opciones";
import SelectorProductos from "./selector-productos";

// Los resultados del período.
//
// Lo primero que se ve es el período entero —los pedidos del mes, el gasto,
// el CPA, la utilidad— y después cada producto con lo suyo. El detalle día
// por día está a un clic, para cuando haga falta. Antes era al revés: elegir
// julio devolvía novecientas filas, una por producto y por día, y para saber
// el CPA del mes había que sacarlo a mano.
//
// Visualmente se buscó que descanse: pocos colores (verde para lo que deja,
// rojo para lo que pierde, gris para el resto), números grandes arriba y la
// tabla con aire entre filas.

type Producto = { id: string; code: string; name: string };

const dinero = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const dinero2 = (n: number) =>
  n.toLocaleString("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const entero = (n: number) => Math.round(n).toLocaleString("es-EC");
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

const PERIODOS = [
  { id: "ayer", texto: "Ayer" },
  { id: "7d", texto: "7 días" },
  { id: "30d", texto: "30 días" },
  { id: "este-mes", texto: "Este mes" },
  { id: "mes-pasado", texto: "Mes pasado" },
];

type Orden = "utilidad" | "pedidos" | "gasto" | "cpa" | "ingresos" | "margen" | "producto";

function diaCorto(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("es-EC", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function Resultados({
  control,
  productos,
  periodo,
  desde,
  hasta,
  hora,
  seleccion,
  detalle,
  meses,
}: {
  control: ControlPeriodo;
  productos: Producto[];
  periodo: string;
  desde: string;
  hasta: string;
  hora: number;
  seleccion: string[];
  detalle: boolean;
  meses: { id: string; texto: string }[];
}) {
  const router = useRouter();
  const [orden, setOrden] = useState<Orden>("utilidad");
  const [tope, setTope] = useState(150);

  const ir = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams({
      vista: "resultados",
      ...(periodo === "personalizado" ? { desde, hasta } : { periodo }),
      hora: String(hora),
      ...(seleccion.length ? { productos: seleccion.join(",") } : {}),
      ...(detalle ? { detalle: "dia" } : {}),
    });
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    router.push(`/dashboard/control?${q.toString()}`);
  };
  const irPeriodo = (id: string) => ir({ periodo: id, desde: null, hasta: null });

  const { totales } = control;

  const ordenados = useMemo(() => {
    const copia = [...control.productos];
    copia.sort((a, b) => {
      if (orden === "producto") return a.producto.localeCompare(b.producto);
      return (b[orden] as number) - (a[orden] as number);
    });
    return copia;
  }, [control.productos, orden]);

  const mesActual = meses.find((m) => m.id === periodo);

  return (
    <div className="flex flex-col gap-5">
      {/* ------------------------------ Filtros ----------------------------- */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => irPeriodo(p.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                periodo === p.id
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {p.texto}
            </button>
          ))}
          <select
            value={mesActual ? periodo : ""}
            onChange={(e) => e.target.value && irPeriodo(e.target.value)}
            className={`rounded-full border px-3 py-1.5 text-xs outline-none transition ${
              mesActual ? "border-foreground font-medium" : "border-border text-muted"
            }`}
            aria-label="Elegir un mes"
          >
            <option value="">Un mes…</option>
            {meses.map((m) => (
              <option key={m.id} value={m.id}>
                {m.texto.charAt(0).toUpperCase() + m.texto.slice(1)}
              </option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted">
            <input
              type="date"
              value={desde}
              onChange={(e) => ir({ periodo: null, desde: e.target.value, hasta })}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              aria-label="Desde"
            />
            <span>a</span>
            <input
              type="date"
              value={hasta}
              onChange={(e) => ir({ periodo: null, desde, hasta: e.target.value })}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
              aria-label="Hasta"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SelectorProductos
            productos={productos}
            seleccion={seleccion}
            onAplicar={(ids) => ir({ productos: ids.join(",") })}
          />
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Corte del día">
            {[...HORAS_CORTE].reverse().map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => ir({ hora: String(h) })}
                title={ETIQUETA_HORA[h]}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  hora === h ? "bg-surface-2 font-medium text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {h === 23 ? "Cierre" : `${h}h`}
              </button>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={detalle}
              onChange={(e) => ir({ detalle: e.target.checked ? "dia" : null })}
            />
            Ver día por día
          </label>
        </div>
      </div>

      {/* ------------------------------ Números ----------------------------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tarjeta titulo="Pedidos" valor={entero(totales.pedidos)} nota={`Plataformas dicen ${entero(totales.pedidosPlataforma)}`} />
        <Tarjeta titulo="Gasto en pauta" valor={dinero(totales.gasto)} nota="Meta + TikTok, todo" />
        <Tarjeta titulo="CPA" valor={totales.pedidos > 0 ? dinero2(totales.cpa) : "—"} nota="gasto ÷ pedidos reales" />
        <Tarjeta titulo="Ingresos" valor={dinero(totales.ingresos)} nota="precio × pedidos efectivos" />
        <Tarjeta
          titulo="Costos"
          valor={dinero(totales.gastosOperativos + totales.gastosAdm)}
          nota={`${dinero(totales.gastosOperativos)} oper. · ${dinero(totales.gastosAdm)} adm.`}
        />
        <Tarjeta
          titulo="Utilidad"
          valor={dinero(totales.utilidad)}
          nota={`margen ${pct(totales.margen)}`}
          tono={totales.utilidad >= 0 ? "bueno" : "malo"}
        />
      </div>

      <Avisos control={control} />

      {control.porDia.length > 1 && <Tendencia puntos={control.porDia} />}

      {/* ------------------------------- Tabla ------------------------------ */}
      {detalle ? (
        <TablaDias filas={control.filas.slice(0, tope)} />
      ) : control.productos.length === 0 && !control.sinAsignar ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
          No hay datos en ese período.
        </div>
      ) : (
        <TablaProductos
          filas={ordenados}
          sinAsignar={control.sinAsignar}
          totales={totales}
          orden={orden}
          onOrden={setOrden}
        />
      )}
      {detalle && control.filas.length > tope && (
        <button
          type="button"
          onClick={() => setTope((t) => t + 150)}
          className="self-center rounded-lg border border-border px-4 py-2 text-xs font-medium transition hover:bg-surface-2"
        >
          Ver 150 más · quedan {entero(control.filas.length - tope)}
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Piezas ------------------------------------ */

function Tarjeta({
  titulo,
  valor,
  nota,
  tono,
}: {
  titulo: string;
  valor: string;
  nota: string;
  tono?: "bueno" | "malo";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <p className="text-[11px] font-medium text-muted">{titulo}</p>
      <p
        className={`mt-1 text-[22px] font-semibold leading-tight tabular-nums ${
          tono === "bueno" ? "text-good" : tono === "malo" ? "text-critical" : ""
        }`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{nota}</p>
    </div>
  );
}

function Avisos({ control }: { control: ControlPeriodo }) {
  const { avisos } = control;
  const lista: { texto: string; href?: string; accion?: string }[] = [];
  if (avisos.pedidosSinAsignar > 0) {
    lista.push({
      texto: `${entero(avisos.pedidosSinAsignar)} pedidos todavía no tienen producto: cuentan en el total, pero sus ingresos no están en la utilidad.`,
      href: "/dashboard/control?vista=enlazar",
      accion: "Enlazarlos",
    });
  }
  if (avisos.mesesSinGastoAdm.length) {
    lista.push({
      texto: `Sin gasto administrativo cargado para ${avisos.mesesSinGastoAdm.map((m) => m.replace("-", "/")).join(", ")}: la utilidad sale más alta de lo real.`,
      href: "/dashboard/control?vista=economia",
      accion: "Cargarlo",
    });
  }
  if (avisos.productosSinEconomia > 0) {
    lista.push({
      texto: `${avisos.productosSinEconomia} productos se calculan con la ficha y no con la economía del mes.`,
      href: "/dashboard/control?vista=economia",
      accion: "Revisar",
    });
  }
  if (avisos.pedidosTesteo > 0) {
    lista.push({ texto: `${entero(avisos.pedidosTesteo)} pedidos de testeo no se cuentan: su pauta sí suma como gasto.` });
  }
  if (lista.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5 rounded-xl border border-border bg-surface px-4 py-3">
      {lista.map((a) => (
        <li key={a.texto} className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted">
          <span className="text-warning">●</span>
          <span className="flex-1">{a.texto}</span>
          {a.href && (
            <Link href={a.href} className="font-medium text-accent-strong underline-offset-2 hover:underline">
              {a.accion} →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Pedidos por día, en barras.
 *
 * Una sola serie y sin ejes cargados: sirve para ver de un vistazo si el mes
 * vino parejo o tuvo un bache, no para leer valores —para eso está la tabla—.
 * Pasar por encima de una barra muestra el día.
 */
function Tendencia({ puntos }: { puntos: ControlPeriodo["porDia"] }) {
  const max = Math.max(...puntos.map((p) => p.pedidos), 1);
  const ancho = 100 / puntos.length;
  return (
    <div className="rounded-xl border border-border bg-surface px-4 pb-3 pt-3.5">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] font-medium text-muted">Pedidos por día</p>
        <p className="text-[11px] text-muted">máx. {entero(max)}</p>
      </div>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-16 w-full" role="img" aria-label="Pedidos por día">
        {puntos.map((p, i) => {
          const h = (p.pedidos / max) * 22;
          return (
            <rect
              key={p.fecha}
              x={i * ancho + ancho * 0.15}
              y={24 - h}
              width={ancho * 0.7}
              height={Math.max(h, 0.4)}
              rx={0.4}
              className={p.utilidad >= 0 ? "fill-accent/70" : "fill-critical/60"}
            >
              <title>
                {diaCorto(p.fecha)}: {entero(p.pedidos)} pedidos · {dinero(p.gasto)} de gasto · utilidad {dinero(p.utilidad)}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>{diaCorto(puntos[0].fecha)}</span>
        <span>{diaCorto(puntos[puntos.length - 1].fecha)}</span>
      </div>
    </div>
  );
}

const TH = "px-3 py-2.5 text-[11px] font-medium text-muted whitespace-nowrap";
const TD = "px-3 py-2.5 whitespace-nowrap";
const NUM = "text-right tabular-nums";

/** Un encabezado que ordena la tabla al tocarlo. */
function Cab({
  o,
  actual,
  onOrden,
  children,
  der = true,
}: {
  o: Orden;
  actual: Orden;
  onOrden: (o: Orden) => void;
  children: React.ReactNode;
  der?: boolean;
}) {
  return (
    <th className={`${TH} ${der ? NUM : "text-left"}`}>
      <button
        type="button"
        onClick={() => onOrden(o)}
        className={`transition hover:text-foreground ${actual === o ? "text-foreground" : ""}`}
      >
        {children}
        {actual === o ? " ↓" : ""}
      </button>
    </th>
  );
}

function TablaProductos({
  filas,
  sinAsignar,
  totales,
  orden,
  onOrden,
}: {
  filas: FilaPeriodo[];
  sinAsignar: FilaPeriodo | null;
  totales: ControlPeriodo["totales"];
  orden: Orden;
  onOrden: (o: Orden) => void;
}) {
  const cab = { actual: orden, onOrden };
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[960px] text-sm">
        <thead className="border-b border-border">
          <tr>
            <Cab {...cab} o="producto" der={false}>Producto</Cab>
            <Cab {...cab} o="pedidos">Pedidos</Cab>
            <Cab {...cab} o="cpa">CPA</Cab>
            <Cab {...cab} o="gasto">Gasto</Cab>
            <th className={`${TH} ${NUM}`}>Efect.</th>
            <Cab {...cab} o="ingresos">Ingresos</Cab>
            <th className={`${TH} ${NUM}`}>Operativos</th>
            <th className={`${TH} ${NUM}`}>Adm.</th>
            <Cab {...cab} o="utilidad">Utilidad</Cab>
            <Cab {...cab} o="margen">Margen</Cab>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.productId} className="border-b border-border/60 last:border-b-0 hover:bg-surface-2/50">
              <td className={TD}>
                <span className="block max-w-[260px] truncate font-medium">{f.producto}</span>
                <span className="text-[10px] text-muted">
                  {f.codigo}
                  {!f.economiaDelMes && <span className="ml-1.5 text-warning">· economía estimada</span>}
                </span>
              </td>
              <td className={`${TD} ${NUM}`}>{entero(f.pedidos)}</td>
              <td className={`${TD} ${NUM}`}>{f.pedidos > 0 ? dinero2(f.cpa) : "—"}</td>
              <td className={`${TD} ${NUM}`}>{dinero(f.gasto)}</td>
              <td className={`${TD} ${NUM} text-muted`}>{f.pedidos > 0 ? pct(f.efectividad) : "—"}</td>
              <td className={`${TD} ${NUM}`}>{dinero(f.ingresos)}</td>
              <td className={`${TD} ${NUM} text-muted`}>{dinero(f.gastosOperativos)}</td>
              <td className={`${TD} ${NUM} text-muted`}>{dinero(f.gastosAdm)}</td>
              <td className={`${TD} ${NUM} font-semibold ${f.utilidad >= 0 ? "text-good" : "text-critical"}`}>
                {dinero(f.utilidad)}
              </td>
              <td className={`${TD} ${NUM} ${f.margen < 0 ? "text-critical" : "text-muted"}`}>
                {f.ingresos > 0 ? pct(f.margen) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border">
          {sinAsignar && (
            <tr className="bg-surface-2/40 text-muted">
              <td className={TD}>
                <span className="block font-medium">{ETIQUETA_SIN_ASIGNAR}</span>
                <span className="text-[10px]">testeo, campañas sin código y pedidos sin enlazar</span>
              </td>
              <td className={`${TD} ${NUM}`}>{entero(sinAsignar.pedidos)}</td>
              <td className={`${TD} ${NUM}`}>—</td>
              <td className={`${TD} ${NUM}`}>{dinero(sinAsignar.gasto)}</td>
              <td className={`${TD} ${NUM}`}>—</td>
              <td className={`${TD} ${NUM}`}>—</td>
              <td className={`${TD} ${NUM}`}>—</td>
              <td className={`${TD} ${NUM}`}>{dinero(sinAsignar.gastosAdm)}</td>
              <td className={`${TD} ${NUM} text-critical`}>{dinero(sinAsignar.utilidad)}</td>
              <td className={`${TD} ${NUM}`}>—</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className={TD}>Total</td>
            <td className={`${TD} ${NUM}`}>{entero(totales.pedidos)}</td>
            <td className={`${TD} ${NUM}`}>{totales.pedidos > 0 ? dinero2(totales.cpa) : "—"}</td>
            <td className={`${TD} ${NUM}`}>{dinero(totales.gasto)}</td>
            <td className={`${TD} ${NUM}`} />
            <td className={`${TD} ${NUM}`}>{dinero(totales.ingresos)}</td>
            <td className={`${TD} ${NUM}`}>{dinero(totales.gastosOperativos)}</td>
            <td className={`${TD} ${NUM}`}>{dinero(totales.gastosAdm)}</td>
            <td className={`${TD} ${NUM} ${totales.utilidad >= 0 ? "text-good" : "text-critical"}`}>
              {dinero(totales.utilidad)}
            </td>
            <td className={`${TD} ${NUM}`}>{totales.ingresos > 0 ? pct(totales.margen) : "—"}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TablaDias({ filas }: { filas: FilaControl[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-border">
          <tr>
            <th className={`${TH} text-left`}>Día</th>
            <th className={`${TH} text-left`}>Producto</th>
            <th className={`${TH} ${NUM}`}>Pedidos</th>
            <th className={`${TH} ${NUM}`}>Plataformas</th>
            <th className={`${TH} ${NUM}`}>CPA</th>
            <th className={`${TH} ${NUM}`}>Gasto</th>
            <th className={`${TH} ${NUM}`}>Ingresos</th>
            <th className={`${TH} ${NUM}`}>Costos</th>
            <th className={`${TH} ${NUM}`}>Utilidad</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr
              key={`${f.fecha}-${f.productId ?? "sin"}`}
              className={`border-b border-border/60 last:border-b-0 hover:bg-surface-2/50 ${
                f.productId ? "" : "text-muted"
              }`}
            >
              <td className={`${TD} text-muted`}>{diaCorto(f.fecha)}</td>
              <td className={TD}>
                <span className="block max-w-[240px] truncate">{f.producto}</span>
              </td>
              <td className={`${TD} ${NUM}`}>{entero(f.pedidos)}</td>
              <td className={`${TD} ${NUM} text-muted`}>{entero(f.pedidosPlataforma)}</td>
              <td className={`${TD} ${NUM}`}>{f.pedidos > 0 && f.productId ? dinero2(f.cpa) : "—"}</td>
              <td className={`${TD} ${NUM}`}>{dinero(f.gasto)}</td>
              <td className={`${TD} ${NUM}`}>{f.productId ? dinero(f.ingresos) : "—"}</td>
              <td className={`${TD} ${NUM} text-muted`}>{dinero(f.gastosOperativos + f.gastosAdm)}</td>
              <td className={`${TD} ${NUM} font-medium ${f.utilidad >= 0 ? "text-good" : "text-critical"}`}>
                {dinero(f.utilidad)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
