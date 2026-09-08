// Lo que de verdad se vendió, al lado de lo que cada plataforma se atribuye.
//
// Es la pregunta que más se hace y la que no tenía respuesta en un solo lugar:
// Shopify dice qué se cobró, Meta y TikTok dicen cuántas compras creen haber
// generado. Nunca coinciden, y esa diferencia es información: si la pauta se
// atribuye el triple de lo que entró, alguien está contando de más y hay
// decisiones tomadas sobre un número inflado.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

import { leerCruce, type CompraRepetida } from "@/lib/atribucion";

export default function AttributionStrip({
  ventasReales,
  ordenesReales,
  meta,
  tiktok,
  periodo,
  desdeElPeriodo,
  ventasDesde,
  repetida,
}: {
  ventasReales: number;
  ordenesReales: number;
  meta: { spend: number; purchases: number; revenue: number };
  tiktok: { spend: number; purchases: number; revenue: number };
  periodo: string;
  /** Cuándo arranca el período elegido. */
  desdeElPeriodo: string;
  /** La orden más vieja que hay guardada, si hay alguna. */
  ventasDesde: string | null;
  /** Primera compra contra recompra, para poder explicar la diferencia. */
  repetida: CompraRepetida;
}) {
  // Si el período pedido empieza antes de la primera orden guardada, la
  // comparación no significa nada: el gasto de pauta estaría completo y las
  // ventas a medias, y parecería un desastre cuando lo que falta es historia.
  const faltaHistoria =
    ventasDesde != null && new Date(desdeElPeriodo) < new Date(ventasDesde.slice(0, 10));

  const gasto = meta.spend + tiktok.spend;
  const atribuidas = meta.purchases + tiktok.purchases;

  // Cuánto de lo facturado se llevó la pauta. Es el número que dice si el
  // negocio cierra, y no depende de a quién se atribuya cada venta.
  const pesoPauta = ventasReales > 0 ? (gasto / ventasReales) * 100 : null;

  // Órdenes atribuidas contra órdenes reales. Por encima de 1 hay doble conteo
  // — las dos plataformas se cuelgan la misma venta.
  const exceso = ordenesReales > 0 ? atribuidas / ordenesReales : null;

  // La cadena que explica la diferencia: de lo que la pauta no cubre, cuánto
  // es gente que ya había comprado y cuánto queda realmente sin explicación.
  const cruce = leerCruce({ ordenesReales, atribuidas, recompra: repetida.recompra });

  const columnas = [
    {
      titulo: "Shopify · lo que se cobró",
      valor: money(ventasReales),
      nota: `${ordenesReales.toLocaleString("es-EC")} órdenes reales`,
      fuerte: true,
    },
    {
      titulo: "Meta · se atribuye",
      valor: `${meta.purchases.toLocaleString("es-EC")} compras`,
      nota: `${money(meta.spend)} de gasto`,
      fuerte: false,
    },
    {
      titulo: "TikTok · se atribuye",
      valor: `${tiktok.purchases.toLocaleString("es-EC")} compras`,
      nota: `${money(tiktok.spend)} de gasto`,
      fuerte: false,
    },
    {
      titulo: "Pauta sobre lo facturado",
      valor: pesoPauta == null ? "—" : `${pesoPauta.toFixed(0)}%`,
      nota: `${money(gasto)} de ${money(ventasReales)}`,
      fuerte: true,
    },
  ];

  return (
    <section className="rounded border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Ventas reales contra lo que atribuye la pauta</h2>
        <span className="text-xs text-muted">{periodo}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4">
        {columnas.map((c, i) => (
          <div
            key={c.titulo}
            className={`px-4 py-3 ${i % 2 === 0 ? "" : "border-l border-border"} ${
              i < 2 ? "border-b border-border lg:border-b-0" : ""
            } ${i === 2 ? "lg:border-l" : ""}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
              {c.titulo}
            </p>
            <p
              className={`mt-0.5 tabular-nums ${c.fuerte ? "text-lg font-semibold" : "text-lg"}`}
            >
              {c.valor}
            </p>
            <p className="text-xs text-muted">{c.nota}</p>
          </div>
        ))}
      </div>

      {faltaHistoria && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-warning">
          Las ventas de Shopify están cargadas desde el{" "}
          {new Date(ventasDesde!).toLocaleDateString("es-EC", {
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
          , pero este período empieza antes. El gasto de pauta sí está completo, así que la
          comparación de arriba subestima las ventas — no las mires como si faltaran ventas,
          falta historia.
        </p>
      )}

      {exceso != null && exceso > 1.3 && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-warning">
          Entre las dos plataformas se atribuyen {atribuidas.toLocaleString("es-EC")} compras, pero
          en Shopify entraron {ordenesReales.toLocaleString("es-EC")} órdenes:{" "}
          {exceso.toFixed(1)} veces más. Es normal que se solapen —una persona ve el anuncio en
          Meta y compra después de verlo en TikTok, y las dos se lo cuelgan—, pero conviene decidir
          con las órdenes de Shopify, que son las que se cobran.
        </p>
      )}

      {/* De dónde sale la diferencia.
          Sin esto, ver "500 órdenes y 380 atribuidas" deja la duda de si se
          perdieron 120 ventas. La mayoría son clientes que vuelven: no llegaron
          por un anuncio nuevo y no tienen por qué estar atribuidos. */}
      {ordenesReales > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
            De dónde salen las {ordenesReales.toLocaleString("es-EC")} órdenes
          </p>

          <div className="mt-2 flex flex-wrap items-stretch gap-2">
            <Tramo
              etiqueta="Las explica la pauta"
              valor={Math.min(atribuidas, ordenesReales)}
              total={ordenesReales}
              tono="bg-accent"
            />
            <Tramo
              etiqueta="Clientes que ya habían comprado"
              valor={cruce.porRecompra}
              total={ordenesReales}
              tono="bg-brand-green"
            />
            <Tramo
              etiqueta="Sin explicación"
              valor={cruce.sinExplicar}
              total={ordenesReales}
              tono={cruce.alerta ? "bg-warning" : "bg-border-strong"}
            />
          </div>

          <p className={`mt-2.5 text-xs ${cruce.alerta ? "text-warning" : "text-muted"}`}>
            {cruce.mensaje}
          </p>

          {repetida.sinIdentificar > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              {repetida.sinIdentificar.toLocaleString("es-EC")} órdenes llegaron sin teléfono ni
              correo, así que de esas no se puede saber si eran clientes nuevos.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Un tramo del desglose: cuántas órdenes y qué parte del total representa. */
function Tramo({
  etiqueta,
  valor,
  total,
  tono,
}: {
  etiqueta: string;
  valor: number;
  total: number;
  tono: string;
}) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return (
    <div className="min-w-[150px] flex-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{valor.toLocaleString("es-EC")}</span>
        <span className="text-[11px] text-muted tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <p className="mt-0.5 text-[11px] leading-tight text-muted">{etiqueta}</p>
      {/* La barra va debajo del número, no en lugar del número: el dato es
          cuántas órdenes son, la proporción es el contexto. */}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tono}`} style={{ width: `${Math.max(pct, 1.5)}%` }} />
      </div>
    </div>
  );
}
