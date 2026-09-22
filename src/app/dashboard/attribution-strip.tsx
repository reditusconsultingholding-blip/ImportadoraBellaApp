// Lo que de verdad se vendió, al lado de lo que cada plataforma se atribuye.
//
// Es la pregunta que más se hace y la que no tenía respuesta en un solo lugar:
// Shopify dice qué se cobró, Meta y TikTok dicen cuántas compras creen haber
// generado. Nunca coinciden, y esa diferencia es información: si la pauta se
// atribuye el triple de lo que entró, alguien está contando de más y hay
// decisiones tomadas sobre un número inflado.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

import Link from "next/link";
import type { ResumenSinProducto } from "@/lib/sin-nomenclatura";
import FrescuraVentas from "./frescura-ventas";

export default function AttributionStrip({
  ventasReales,
  ordenesReales,
  meta,
  tiktok,
  periodo,
  desdeElPeriodo,
  ventasDesde,
  sinProducto,
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
  /** Campañas que no cuelgan de ningún producto, con su gasto del período. */
  sinProducto: ResumenSinProducto;
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <h2 className="text-sm font-semibold">Ventas reales contra lo que atribuye la pauta</h2>
        <span className="text-xs text-muted">{periodo}</span>
        {/* De cuándo es cada mitad de la comparación. */}
        <span className="w-full">
          <FrescuraVentas />
        </span>
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

      {/* Por qué los números no coinciden.
          Antes esto partía las órdenes en "las explica la pauta", "clientes que
          ya habían comprado" y "sin explicación", como si la diferencia fueran
          ventas de otro origen. No lo son: todas las ventas de la tienda entran
          por los enlaces de la pauta. Las recompras existen —el 17 de
          septiembre, 55 de 66 eran clientes que volvían más de una semana
          después—, pero volvieron por un anuncio igual que los nuevos. Lo que
          falta del lado de Meta y TikTok es lo que su píxel no alcanza a
          registrar: zona horaria, bloqueo en iOS, ventana de atribución. Emilia
          lo dijo así en la reunión, y es lo que el panel tiene que decir. */}
      {ordenesReales > 0 && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted">
            Cuántas registran las plataformas
          </p>

          <div className="mt-2 flex flex-wrap items-stretch gap-2">
            <Tramo
              etiqueta="Pedidos reales en la tienda"
              valor={ordenesReales}
              total={ordenesReales}
              tono="bg-accent"
            />
            <Tramo
              etiqueta="Los registra el píxel de Meta o TikTok"
              valor={Math.min(atribuidas, ordenesReales)}
              total={ordenesReales}
              tono="bg-brand-green"
            />
            <Tramo
              etiqueta="El píxel no los alcanzó a registrar"
              valor={Math.max(0, ordenesReales - atribuidas)}
              total={ordenesReales}
              tono="bg-border-strong"
            />
          </div>

          <p className="mt-2.5 text-xs text-muted">
            {atribuidas >= ordenesReales
              ? `Meta y TikTok se atribuyen ${atribuidas.toLocaleString("es-EC")} compras contra ${ordenesReales.toLocaleString("es-EC")} pedidos reales: se solapan, las dos se cuelgan algunas de las mismas ventas. Para decidir, el número que manda es el de la tienda.`
              : `Todas las ventas entran por los enlaces de la pauta; ${Math.max(0, ordenesReales - atribuidas).toLocaleString("es-EC")} no las registró el píxel —zona horaria, bloqueo en iOS, ventana de atribución—. Es el margen de error de las plataformas, no ventas de otro lado. Para decidir, el número que manda es el de la tienda: el CPA real está en Control publicitario.`}
          </p>

          {/* De las tres causas que nombra el mensaje de arriba, una se puede
              medir: las campañas que no cuelgan de ningún producto. Dejarla
              como hipótesis obligaba a creerla o descartarla sin datos; acá se
              dice cuántas son, cuánto gastaron y se abre la puerta para ir a
              emparejarlas. Las otras dos —mensajes directos y gente que entra
              por el link— no dejan rastro en lo que Shopify nos manda, y por
              eso siguen siendo una hipótesis y se dicen como tal. */}
          {sinProducto.campanas > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded border border-border bg-surface-2 px-3 py-2">
              <p className="min-w-[18rem] flex-1 text-xs text-muted">
                De esas causas, una se puede medir:{" "}
                <strong className="font-medium text-foreground">
                  {sinProducto.campanas.toLocaleString("es-EC")}{" "}
                  {sinProducto.campanas === 1 ? "campaña no cuelga" : "campañas no cuelgan"} de
                  ningún producto
                </strong>
                {sinProducto.conGasto > 0 ? (
                  <>
                    {" "}
                    y {sinProducto.conGasto === 1 ? "la que gastó se llevó" : `${sinProducto.conGasto} de ellas se llevaron`}{" "}
                    {money(sinProducto.gasto)} en este período, con{" "}
                    {sinProducto.compras.toLocaleString("es-EC")}{" "}
                    {sinProducto.compras === 1 ? "compra atribuida" : "compras atribuidas"} que no
                    suman a la rentabilidad de nadie.
                  </>
                ) : (
                  <>, aunque ninguna gastó en este período.</>
                )}
              </p>
              <Link
                href="/dashboard/sin-nomenclatura"
                className="shrink-0 rounded border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-surface-2"
              >
                Verlas y asignarlas
              </Link>
            </div>
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
