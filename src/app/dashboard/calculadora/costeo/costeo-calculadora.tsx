"use client";

import { useMemo, useState } from "react";
import {
  avisosDeCosteo,
  calcularCosteo,
  COSTEO_POR_DEFECTO,
  desdeLaFicha,
  type EntradaCosteo,
} from "@/lib/costeo";

/**
 * La calculadora de costeo y utilidad, en tres pasos y en vertical.
 *
 * Es una columna y no dos a propósito. Con los campos a la izquierda y los
 * resultados a la derecha, el número se mueve MIENTRAS se teclea al lado, y eso
 * hace que nadie lo mire. En vertical se contesta el paso, se baja, y el
 * resultado está esperando.
 *
 * Las cuentas no viven acá: están en `lib/costeo.ts`, que es la misma máquina
 * que usa la calculadora del otro proyecto de la agencia. Acá solo se pregunta
 * y se muestra.
 */

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

const money = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
    : "—";

const money0 = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";

const porcentaje = (n: number, dec = 1) => (Number.isFinite(n) ? `${n.toFixed(dec)}%` : "—");
const unidades = (n: number) => (Number.isFinite(n) ? n.toFixed(1).replace(/\.0$/, "") : "—");

/** El semáforo de la regla del 50%: el costo no puede pasar de medio precio. */
function nivelMargenBruto(pct: number) {
  if (pct >= 60) return "bien" as const;
  if (pct >= 50) return "medio" as const;
  return "mal" as const;
}

const TONO = {
  bien: "text-good",
  medio: "text-warning",
  mal: "text-critical",
} as const;

/* ------------------------------- Piezas sueltas --------------------------- */

function Campo({
  etiqueta,
  valor,
  onChange,
  sufijo,
  ayuda,
}: {
  etiqueta: string;
  valor: number;
  onChange: (v: string) => void;
  sufijo?: string;
  ayuda?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{etiqueta}</span>
      <span className="mt-1 flex items-center rounded border border-border bg-surface-2 focus-within:border-accent">
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        {sufijo && <span className="pr-2 text-xs text-muted">{sufijo}</span>}
      </span>
      {ayuda && <span className="mt-1 block text-[11px] leading-snug text-muted">{ayuda}</span>}
    </label>
  );
}

function Cifra({
  etiqueta,
  valor,
  nota,
  tono,
  grande,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  tono?: "bien" | "medio" | "mal";
  grande?: boolean;
}) {
  return (
    <div className="rounded border border-border bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{etiqueta}</p>
      <p
        className={`mt-1 font-semibold ${grande ? "text-[22px]" : "text-[15px]"} ${
          tono ? TONO[tono] : ""
        }`}
      >
        {valor}
      </p>
      {nota && <p className="mt-0.5 text-[11px] leading-snug text-muted">{nota}</p>}
    </div>
  );
}

function Paso({
  numero,
  titulo,
  descripcion,
  children,
}: {
  numero: number;
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
          {numero}
        </span>
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="mt-0.5 text-xs text-muted">{descripcion}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Un bloque oscuro para los tres números que de verdad deciden. */
function Destacado({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-brand-navy-deep p-4">{children}</div>
  );
}

/* -------------------------------- La pantalla ----------------------------- */

export default function CosteoCalculadora({ fichas }: { fichas: FichaCalculadora[] }) {
  const [v, setV] = useState<EntradaCosteo>(COSTEO_POR_DEFECTO);
  const [cargado, setCargado] = useState("");
  const [avanzado, setAvanzado] = useState(false);

  const r = useMemo(() => calcularCosteo(v), [v]);
  const avisos = useMemo(() => avisosDeCosteo(v, r), [v, r]);

  const set = (clave: keyof EntradaCosteo) => (crudo: string) => {
    // Se limpia todo lo que no sea número: quien teclea "$39,90" o "39.90"
    // está escribiendo lo mismo, y rechazárselo por la coma es tratarlo de
    // torpe cuando el torpe es el campo.
    const n = Number(crudo.replace(",", ".").replace(/[^\d.-]/g, ""));
    setV((prev) => ({ ...prev, [clave]: Number.isFinite(n) ? n : 0 }));
  };

  function cargarProducto(code: string) {
    setCargado(code);
    const f = fichas.find((x) => x.code === code);
    if (!f) return;
    setV((prev) => desdeLaFicha(prev, f));
  }

  const nivel = nivelMargenBruto(r.producto.pctMargenBrutoUnit);
  const bloqueante = avisos.find((a) => a.nivel === "bloqueante");
  const entregaHoy = 100 - r.dia.pctTotalPerdida;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {avisos.length > 0 && (
        <div className="flex flex-col gap-2">
          {avisos.map((a, i) => (
            <p
              key={i}
              className={`rounded border px-3 py-2 text-xs leading-relaxed ${
                a.nivel === "bloqueante"
                  ? "border-critical bg-critical-bg text-critical"
                  : "border-warning bg-pending-bg text-warning"
              }`}
            >
              {a.texto}
            </p>
          ))}
        </div>
      )}

      {/* Cargar un producto real antes que teclear nada: el caso de fábrica es
          un ejemplo, y decidir sobre un ejemplo no sirve para nada. */}
      {fichas.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <label className="block">
            <span className="text-xs font-medium">Empezá con un producto de la tienda</span>
            <select
              value={cargado}
              onChange={(e) => cargarProducto(e.target.value)}
              className="mt-1.5 w-full rounded border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Escribir los números a mano</option>
              {fichas.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code} — {f.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-[11px] leading-snug text-muted">
            Trae precio, costo, flete, efectividad y devoluciones de su ficha. Cambiá lo que quieras
            probar: nada de lo que toques acá modifica el producto.
          </p>
        </div>
      )}

      {/* ------------------------------ Paso 1 ------------------------------ */}
      <Paso
        numero={1}
        titulo="El producto"
        descripcion="Cuánto cuesta poner un pedido en la puerta del cliente."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Precio de venta" valor={v.pvp} onChange={set("pvp")} sufijo="$" />
          <Campo
            etiqueta="Costo del producto"
            valor={v.costoProducto}
            onChange={set("costoProducto")}
            sufijo="$"
          />
          <Campo
            etiqueta="Flete de ida"
            valor={v.fletePromedio}
            onChange={set("fletePromedio")}
            sufijo="$"
            ayuda="Se paga aunque el paquete vuelva."
          />
        </div>

        <Destacado>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-green">
            Margen bruto
          </p>
          <p
            className={`mt-1 text-[28px] font-semibold leading-none ${
              nivel === "bien"
                ? "text-good"
                : nivel === "medio"
                  ? "text-warning"
                  : "text-critical"
            }`}
          >
            {porcentaje(r.producto.pctMargenBrutoUnit)}
          </p>
          <p className="mt-1.5 text-xs text-white/60">
            {money(r.producto.margenBrutoUnit)} por entrega, antes de publicidad. El costo se lleva{" "}
            {porcentaje(r.producto.pctCostoSobrePvp, 0)} del precio y el flete{" "}
            {porcentaje(r.producto.pctFleteSobrePvp, 0)}.
          </p>
          <p className="mt-2 text-[11px] leading-snug text-white/45">
            {nivel === "bien"
              ? "Por encima del 60%: hay aire para escalar cuando el CPA suba."
              : nivel === "medio"
                ? "Entre 50% y 60%: alcanza, pero no aguanta una subida del CPA."
                : "Por debajo del 50%: el costo se está comiendo más de la mitad del precio."}
          </p>
        </Destacado>

        <div className="grid gap-3 sm:grid-cols-3">
          <Cifra
            etiqueta="Costo por entrega"
            valor={money(r.producto.costoUnitarioBase)}
            nota="Producto + flete"
          />
          <Cifra
            etiqueta="Precio mínimo"
            valor={money(r.producto.precioMinimo50)}
            nota="Donde el margen bruto llega al 50%"
          />
          <Cifra
            etiqueta="Precio a publicar"
            valor={money(r.producto.precioDePublicacion)}
            nota="El del 60%, en cifra publicable"
          />
        </div>

        {/* La escalera es la oferta con la que de verdad se vende: casi ningún
            anuncio de contraentrega lleva un precio suelto. */}
        <div>
          <p className="text-xs font-medium">La escalera de la oferta</p>
          <p className="mt-0.5 text-[11px] text-muted">
            El pack puede costar menos por unidad sin regalar margen, porque paga un solo flete.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            {r.producto.escalera.map((t) => (
              <div key={t.unidades} className="rounded border border-border bg-surface-2 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {t.unidades === 1 ? "1 unidad" : `${t.unidades} unidades`}
                </p>
                <p className="mt-1 text-[17px] font-semibold">{money(t.precio)}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  Margen {porcentaje(t.pctMargen, 0)} · {money(t.margen)}
                </p>
                {t.ahorro > 0 && (
                  <p className="mt-0.5 text-[11px] text-good">
                    Ahorra {money(t.ahorro)} ({porcentaje(t.pctAhorro, 0)})
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </Paso>

      {/* ------------------------------ Paso 2 ------------------------------ */}
      <Paso
        numero={2}
        titulo="La operación"
        descripcion="Qué pasa cuando los pedidos salen a la calle."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Pedidos por día" valor={v.pedidosDia} onChange={set("pedidosDia")} />
          <Campo
            etiqueta="Cancelación"
            valor={v.pctCancelacion}
            onChange={set("pctCancelacion")}
            sufijo="%"
            ayuda="Se caen antes de despachar."
          />
          <Campo
            etiqueta="Devolución"
            valor={v.pctDevolucion}
            onChange={set("pctDevolucion")}
            sufijo="%"
            ayuda="Sobre los pedidos que entran, no sobre los despachados."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Cifra etiqueta="Entran" valor={unidades(v.pedidosDia)} nota="pedidos al día" />
          <Cifra
            etiqueta="Se despachan"
            valor={unidades(r.dia.despachados)}
            nota={`${unidades(r.dia.pedidosCancelados)} se cancelan`}
          />
          <Cifra
            etiqueta="Vuelven"
            valor={unidades(r.dia.devueltos)}
            nota={`${money0(r.dia.costoFletesDevueltos)} en fletes`}
            tono={r.dia.devueltos > 0 ? "mal" : undefined}
          />
          <Cifra
            etiqueta="Se cobran"
            valor={unidades(r.dia.entregados)}
            nota={`${porcentaje(entregaHoy, 0)} de entrega`}
            tono="bien"
          />
        </div>

        <Destacado>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-green">
            Margen real del día
          </p>
          <p className="mt-1 text-[28px] font-semibold leading-none text-white">
            {money(r.dia.margenBrutoReal)}
          </p>
          <p className="mt-1.5 text-xs text-white/60">
            De {money(r.dia.ingresoTotal)} que entran, se cobran {money(r.dia.ingresoEntregado)}. La
            cancelación se lleva {money(r.dia.perdidaPorCancelacion)} y las devoluciones{" "}
            {money(r.dia.perdidaPorDevolucion)} de facturación.
          </p>
          <p className="mt-2 text-[11px] leading-snug text-white/45">
            Este es el número del que cuelga todo lo de abajo: es lo que hay para repartir entre
            publicidad y utilidad.
          </p>
        </Destacado>
      </Paso>

      {/* ------------------------------ Paso 3 ------------------------------ */}
      <Paso
        numero={3}
        titulo="La publicidad"
        descripcion="Cuánto se puede gastar en anuncios sin quedarse sin utilidad."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            etiqueta="Del margen real a publicidad"
            valor={v.pctPauta}
            onChange={set("pctPauta")}
            sufijo="%"
            ayuda="35% es la regla; más que eso es techo, no plan."
          />
          <Campo
            etiqueta="CPA que estás pagando hoy"
            valor={v.cpaActual}
            onChange={set("cpaActual")}
            sufijo="$"
            ayuda="Por pedido generado, como lo reporta la plataforma."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Cifra
            etiqueta="Presupuesto del día"
            valor={money(r.pauta.presupuesto)}
            nota={`${porcentaje(v.pctPauta, 0)} del margen real`}
          />
          <Cifra
            etiqueta="CPA máximo"
            valor={money(r.pauta.cpaMaximoPorPedido)}
            nota="El que se teclea en Meta"
          />
          <Cifra
            etiqueta="CPA de equilibrio"
            valor={money(r.pauta.cpaEquilibrio)}
            nota="Pasado de acá, el día pierde"
            tono={v.cpaActual > r.pauta.cpaEquilibrio ? "mal" : "bien"}
          />
        </div>

        <Destacado>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-green">
            Utilidad del día, con tu CPA de hoy
          </p>
          <p
            className={`mt-1 text-[28px] font-semibold leading-none ${
              r.pauta.utilidadConPautaReal >= 0 ? "text-good" : "text-critical"
            }`}
          >
            {money(r.pauta.utilidadConPautaReal)}
          </p>
          <p className="mt-1.5 text-xs text-white/60">
            Gastás {money(r.pauta.pautaReal)} al día en anuncios, que es{" "}
            {porcentaje(r.pauta.pctMargenConsumidoPautaReal, 0)} del margen real. De eso,{" "}
            {money(r.pauta.pautaQuemadaSinEntrega)} se paga por pedidos que nunca se cobran.
          </p>
          <div className="mt-3 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">
                Costo real por unidad
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {money(r.unitario.costoTotal)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">
                Te queda por unidad
              </p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {money(r.unitario.utilidadPorProducto)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-white/40">Margen real</p>
              <p className="mt-0.5 text-sm font-semibold text-white">
                {porcentaje(r.unitario.margenUtilidad)}
              </p>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-white/45">
            El margen real es más bajo que el bruto de arriba porque acá la publicidad —toda, la de
            los cancelados incluida— está dentro del costo de cada unidad que sí se cobra.
          </p>
        </Destacado>
      </Paso>

      {/* -------------------------------- El mes ---------------------------- */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">El mes</h2>
            <p className="mt-0.5 text-xs text-muted">
              Con las mismas cuentas del día, repetidas los días que operás.
            </p>
          </div>
          <div className="w-28">
            <Campo etiqueta="Días al mes" valor={v.diasMes} onChange={set("diasMes")} />
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Cifra etiqueta="Facturación" valor={money0(r.mes.ingresoEntregado)} nota="lo cobrado" />
          <Cifra etiqueta="Margen real" valor={money0(r.mes.margenBrutoReal)} />
          <Cifra
            etiqueta="Utilidad con tu CPA"
            valor={money0(r.mes.utilidadConPautaReal)}
            tono={r.mes.utilidadConPautaReal >= 0 ? "bien" : "mal"}
            grande
          />
        </div>

        <p className="mt-4 text-xs font-medium">Si movés el porcentaje de pauta</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {r.mes.escenarios.map((e) => (
            <div
              key={e.pct}
              className={`rounded border px-3 py-2.5 ${
                e.recomendado ? "border-accent bg-good-bg" : "border-border bg-surface-2"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                {e.pct}% a publicidad {e.recomendado && "· la regla"}
              </p>
              <p className="mt-1 text-[15px] font-semibold">{money0(e.utilidadOperacional)}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {money0(e.presupuesto)} de pauta · CPA máx {money(e.cpaMaximo)}
              </p>
            </div>
          ))}
        </div>

        {v.gastosFijosMes > 0 && (
          <p className="mt-3 text-xs text-muted">
            Después de {money0(v.gastosFijosMes)} de gastos fijos, quedan{" "}
            <strong
              className={r.mes.utilidadNeta >= 0 ? "text-good" : "text-critical"}
            >
              {money0(r.mes.utilidadNeta)}
            </strong>
            .
          </p>
        )}
      </section>

      {/* ------------------------ Equilibrio y caja -------------------------- */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold">Dónde está el filo</h2>
        <p className="mt-0.5 text-xs text-muted">
          Cuánto tiene que salir mal para que este producto deje de ganar.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Cifra
            etiqueta="Entrega necesaria"
            valor={porcentaje(r.equilibrio.tasaEntregaEquilibrio, 0)}
            nota={`Estás entregando ${porcentaje(entregaHoy, 0)}: ${
              r.equilibrio.holguraEntrega >= 0 ? "te sobran" : "te faltan"
            } ${Math.abs(r.equilibrio.holguraEntrega).toFixed(0)} puntos`}
            tono={r.equilibrio.holguraEntrega >= 10 ? "bien" : r.equilibrio.holguraEntrega >= 0 ? "medio" : "mal"}
          />
          <Cifra
            etiqueta="Precio de equilibrio"
            valor={money(r.equilibrio.pvpEquilibrioCpaReal)}
            nota={`Con el CPA de hoy. Vendés a ${money(v.pvp)}`}
            tono={v.pvp > r.equilibrio.pvpEquilibrioCpaReal ? "bien" : "mal"}
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Cifra
            etiqueta="Sale del bolsillo cada día"
            valor={money0(r.caja.desembolsoDiario)}
            nota="Pauta, mercancía y fletes"
          />
          <Cifra
            etiqueta="Capital de trabajo"
            valor={money0(r.caja.capitalTrabajoRequerido)}
            nota={`Lo que hay que sostener hasta que la transportadora consigne, a ${v.diasCartera} días`}
          />
        </div>
        <p className="mt-3 text-[11px] leading-snug text-muted">
          En contraentrega casi nadie quiebra por margen: quiebra por caja. La publicidad se paga
          hoy, la mercancía se pagó antes y el recaudo llega dos semanas después.
        </p>
      </section>

      {/* ------------------------- Ajustes avanzados ------------------------ */}
      <section className="rounded-xl border border-border bg-surface">
        <button
          type="button"
          onClick={() => setAvanzado((x) => !x)}
          aria-expanded={avanzado}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-surface-2"
        >
          <span>
            <span className="block text-sm font-semibold">Costos que casi nadie cuenta</span>
            <span className="mt-0.5 block text-xs text-muted">
              Empiezan en cero para que el resultado se pueda comparar con cualquier otra
              calculadora. Encendé los que conozcas.
            </span>
          </span>
          <span className="ml-3 shrink-0 text-xs text-muted">{avanzado ? "Cerrar" : "Abrir"}</span>
        </button>

        {avanzado && (
          <div className="grid gap-3 border-t border-border p-5 sm:grid-cols-2">
            <Campo
              etiqueta="Flete de retorno"
              valor={v.fleteRetornoDevolucion}
              onChange={set("fleteRetornoDevolucion")}
              sufijo="$"
              ayuda="Lo que cobra la transportadora por devolverte el paquete."
            />
            <Campo
              etiqueta="Mercancía que vuelve vendible"
              valor={v.pctRecuperacionMercancia}
              onChange={set("pctRecuperacionMercancia")}
              sufijo="%"
              ayuda="100% = todo lo devuelto se puede volver a vender."
            />
            <Campo
              etiqueta="Comisión de recaudo"
              valor={v.pctComisionRecaudo}
              onChange={set("pctComisionRecaudo")}
              sufijo="%"
              ayuda="Sobre lo entregado."
            />
            <Campo
              etiqueta="Empaque por despacho"
              valor={v.costoEmpaquePorDespacho}
              onChange={set("costoEmpaquePorDespacho")}
              sufijo="$"
            />
            <Campo
              etiqueta="Confirmación por pedido"
              valor={v.costoConfirmacionPorPedido}
              onChange={set("costoConfirmacionPorPedido")}
              sufijo="$"
              ayuda="La llamada o el WhatsApp, por pedido que entra."
            />
            <Campo
              etiqueta="Gastos fijos del mes"
              valor={v.gastosFijosMes}
              onChange={set("gastosFijosMes")}
              sufijo="$"
              ayuda="Nómina, arriendo, plataformas."
            />
            <Campo
              etiqueta="Días de cartera"
              valor={v.diasCartera}
              onChange={set("diasCartera")}
              ayuda="Lo que tarda la transportadora en consignarte."
            />
          </div>
        )}
      </section>

      {/* La prueba del modelo, dicha en voz alta.

          Las dos fórmulas —margen real menos pauta, y entregados por utilidad
          unitaria menos fletes devueltos— tienen que dar lo mismo. Mostrarlo
          cuando NO cuadra es lo único que separa un error de cálculo de un
          número que alguien se lleva a una reunión. */}
      {Math.abs(r.unitario.utilidadDiaControlCruzado - r.pauta.utilidadOperacional) > 0.01 && (
        <p className="rounded border border-critical bg-critical-bg px-3 py-2 text-xs text-critical">
          Los dos caminos de la utilidad del día no coinciden ({money(r.unitario.utilidadDiaControlCruzado)}{" "}
          contra {money(r.pauta.utilidadOperacional)}). Es un error del cálculo, no de tus datos: no
          tomes decisiones con esta pantalla y avisá.
        </p>
      )}

      {bloqueante && (
        <p className="text-xs text-muted">
          Mientras el aviso de arriba siga, los números de esta pantalla describen un negocio
          imposible.
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setV(COSTEO_POR_DEFECTO);
          setCargado("");
        }}
        className="self-start text-xs text-muted underline transition hover:text-foreground"
      >
        Volver a empezar
      </button>
    </div>
  );
}
