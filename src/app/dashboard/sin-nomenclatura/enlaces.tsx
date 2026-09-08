"use client";

import { useMemo, useState } from "react";
import type { Cobertura, Propuesta } from "@/lib/enlace-shopify";
import type { OpcionProducto } from "./lista";
import { Girando } from "../navegar";

// Enlazar lo que vende la tienda con los productos que pautamos.
//
// Cada fila es un nombre con el que Shopify facturó y que todavía no cuelga de
// ningún producto nuestro. Mientras esté suelto, esa plata no entra en
// Rentabilidad — por eso la lista va ordenada por facturación y no alfabética.
//
// La sugerencia se muestra pero no se aplica sola. Ver `lib/enlace-shopify.ts`:
// el emparejador acierta el 73% de la facturación, y el 27% restante son casos
// como "Cepillo de Inodoro Desechable" contra "CEPILLO 9 EN 1", donde meter la
// venta de un producto dentro de otro sería peor que dejarla afuera.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Puntaje desde el que la sugerencia se puede aceptar en bloque. */
const EXACTO = 0.999;

export default function Enlaces({
  propuestas: iniciales,
  cobertura: coberturaInicial,
  opciones,
  periodo,
}: {
  propuestas: Propuesta[];
  cobertura: Cobertura;
  opciones: OpcionProducto[];
  periodo: string;
}) {
  const [propuestas, setPropuestas] = useState(iniciales);
  const [cobertura, setCobertura] = useState(coberturaInicial);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [enLote, setEnLote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  // Las que se pueden aceptar sin mirar: coinciden palabra por palabra Y no
  // tienen otro producto empatado detrás. La segunda condición es la que
  // importa — "Ampolla Deep Collagen" coincide perfecto con DEEP COLLAGEN
  // AMPOULE y con SUNGBOON DEEP COLLAGEN a la vez, y aceptarla en bloque sería
  // repartir la facturación por sorteo.
  const exactas = useMemo(
    () => propuestas.filter((p) => p.sugerido != null && p.sugerido.puntaje >= EXACTO && !p.dudosa),
    [propuestas],
  );

  // Se muestran las veinticinco que más facturan salvo que se pidan todas: son
  // ciento y pico de nombres, y los de abajo mueven monedas.
  const visibles = verTodas ? propuestas : propuestas.slice(0, 25);

  async function enlazar(nombre: string, productId: string, automatico: boolean) {
    const res = await fetch("/api/enlaces-shopify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, productId, automatico }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error ?? `El servidor respondió ${res.status}.`);
    }
  }

  /** Saca la fila de la lista y mueve su plata a la columna de lo enlazado. */
  function contabilizar(p: Propuesta) {
    setPropuestas((previas) => previas.filter((x) => x.nombre !== p.nombre));
    setCobertura((c) => {
      const enlazado = c.facturadoEnlazado + p.facturado;
      return {
        ...c,
        facturadoEnlazado: enlazado,
        parte: c.facturadoTotal > 0 ? enlazado / c.facturadoTotal : 0,
        nombresEnlazados: c.nombresEnlazados + 1,
        nombresSueltos: Math.max(0, c.nombresSueltos - 1),
      };
    });
  }

  async function aceptar(p: Propuesta, productId: string, automatico: boolean) {
    setGuardando(p.nombre);
    setError(null);
    try {
      await enlazar(p.nombre, productId, automatico);
      contabilizar(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(null);
    }
  }

  async function aceptarExactas() {
    setEnLote(true);
    setError(null);
    // Una por una y no todas de golpe: si la número treinta falla, las
    // veintinueve anteriores tienen que quedar guardadas igual.
    for (const p of exactas) {
      try {
        await enlazar(p.nombre, p.sugerido!.id, true);
        contabilizar(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        break;
      }
    }
    setEnLote(false);
  }

  const claseCampo =
    "rounded border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground focus:border-border-strong focus:outline-none";

  const pct = Math.round(cobertura.parte * 100);

  return (
    <section className="rounded border border-border bg-surface">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Ventas de Shopify sin enlazar a un producto</h2>
          <p className="mt-0.5 max-w-3xl text-xs text-muted">
            Es lo que hace que Rentabilidad muestre un ingreso mucho más chico que lo facturado:
            mientras un nombre esté suelto, esa venta no se le puede sumar a ningún producto.
          </p>
        </div>
        <span className="text-xs text-muted">{periodo}</span>
      </div>

      <div className="grid grid-cols-2 border-b border-border sm:grid-cols-3">
        {[
          {
            t: "Facturación reconocida",
            v: `${pct}%`,
            n: `${money(cobertura.facturadoEnlazado)} de ${money(cobertura.facturadoTotal)}`,
          },
          {
            t: "Nombres enlazados",
            v: cobertura.nombresEnlazados.toLocaleString("es-EC"),
            n: "ya cuelgan de un producto",
          },
          {
            t: "Nombres sueltos",
            v: cobertura.nombresSueltos.toLocaleString("es-EC"),
            n: "su venta no entra en Rentabilidad",
          },
        ].map((c, i) => (
          <div
            key={c.t}
            className={`px-4 py-2.5 ${i > 0 ? "border-l border-border" : ""} ${
              i < 2 ? "border-b border-border sm:border-b-0" : ""
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">{c.t}</p>
            <p className="mt-0.5 text-base font-semibold tabular-nums">{c.v}</p>
            <p className="text-[11px] text-muted">{c.n}</p>
          </div>
        ))}
      </div>

      {/* La barra de cobertura: es el número que dice si vale la pena mirar
          Rentabilidad todavía. Al 30% de facturación reconocida, la pantalla
          sigue describiendo un tercio del negocio. */}
      <div className="border-b border-border px-4 py-2.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full rounded-full ${pct >= 80 ? "bg-good" : pct >= 40 ? "bg-warning" : "bg-critical"}`}
            style={{ width: `${Math.max(pct, 1)}%` }}
          />
        </div>
      </div>

      {error && (
        <p className="border-b border-border bg-critical-bg px-4 py-2 text-xs text-critical">
          No se pudo guardar: {error}
        </p>
      )}

      {propuestas.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted">
          Todo lo que facturó la tienda en el período está enlazado a un producto.
        </p>
      ) : (
        <>
          {exactas.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-2.5">
              <p className="min-w-[16rem] flex-1 text-xs text-muted">
                <strong className="font-medium text-foreground">
                  {exactas.length} {exactas.length === 1 ? "coincide" : "coinciden"} palabra por
                  palabra
                </strong>{" "}
                con un solo producto — {money(exactas.reduce((s, p) => s + p.facturado, 0))} de
                facturación. Esas se pueden aceptar juntas. Las que empatan con dos productos
                quedan afuera a propósito y hay que mirarlas una por una.
              </p>
              <button
                type="button"
                onClick={aceptarExactas}
                disabled={enLote}
                className="flex shrink-0 items-center gap-2 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
              >
                {enLote && <Girando />}
                {enLote ? "Enlazando…" : "Aceptar las que coinciden exacto"}
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.07em] text-muted">
                  <th className="px-4 py-2 font-semibold">Como se llama en Shopify</th>
                  <th className="px-3 py-2 text-right font-semibold">Facturado</th>
                  <th className="px-3 py-2 text-right font-semibold">Unidades</th>
                  <th className="px-4 py-2 font-semibold">Es este producto</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p) => (
                  <tr key={p.nombre} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-2.5">
                      <span className="block max-w-[24rem] truncate" title={p.nombre}>
                        {p.nombre}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {money(p.facturado)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                      {p.unidades.toLocaleString("es-EC")}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex flex-wrap items-center gap-2">
                        {p.sugerido && (
                          <button
                            type="button"
                            onClick={() => aceptar(p, p.sugerido!.id, true)}
                            disabled={guardando === p.nombre || enLote}
                            className={`rounded border px-2.5 py-1.5 text-xs font-medium transition hover:bg-surface disabled:opacity-60 ${
                              p.dudosa
                                ? "border-warning bg-pending-bg"
                                : "border-accent bg-good-bg"
                            }`}
                            title={`Parecido ${(p.sugerido.puntaje * 100).toFixed(0)}%`}
                          >
                            {p.sugerido.code} — {p.sugerido.name}
                          </button>
                        )}
                        {/* Con quién empata. Se nombra en vez de decir solo
                            "dudosa": sin saber contra qué compite, la advertencia
                            obliga a abrir la lista entera para decidir. */}
                        {p.dudosa && p.rival && (
                          <span className="block w-full text-[11px] leading-snug text-warning">
                            Empata con {p.rival.code} — {p.rival.name}. Mirala antes de aceptar.
                          </span>
                        )}
                        <select
                          defaultValue=""
                          disabled={guardando === p.nombre || enLote}
                          onChange={(e) => e.target.value && aceptar(p, e.target.value, false)}
                          className={`${claseCampo} min-w-[180px]`}
                          aria-label={`Elegir producto para ${p.nombre}`}
                        >
                          <option value="">
                            {p.sugerido ? "…o elegir otro" : "Elegir producto…"}
                          </option>
                          {opciones.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.code} — {o.name}
                            </option>
                          ))}
                        </select>
                        {guardando === p.nombre && <Girando />}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {propuestas.length > visibles.length && (
            <div className="border-t border-border px-4 py-2.5">
              <button
                type="button"
                onClick={() => setVerTodas(true)}
                className="text-xs text-muted underline transition hover:text-foreground"
              >
                Ver los {(propuestas.length - visibles.length).toLocaleString("es-EC")} nombres
                restantes ({money(propuestas.slice(25).reduce((s, p) => s + p.facturado, 0))} entre
                todos)
              </button>
            </div>
          )}

          <p className="border-t border-border px-4 py-2.5 text-[11px] leading-snug text-muted">
            El botón verde es la sugerencia automática: aceptarla la guarda. Si está mal, elegí el
            producto correcto en la lista de al lado —eso pisa la sugerencia— y si el nombre no
            corresponde a ningún producto tuyo, dejalo suelto.
          </p>
        </>
      )}
    </section>
  );
}
