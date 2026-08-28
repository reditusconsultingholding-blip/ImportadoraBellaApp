// Lo que de verdad se vendió, al lado de lo que cada plataforma se atribuye.
//
// Es la pregunta que más se hace y la que no tenía respuesta en un solo lugar:
// Shopify dice qué se cobró, Meta y TikTok dicen cuántas compras creen haber
// generado. Nunca coinciden, y esa diferencia es información: si la pauta se
// atribuye el triple de lo que entró, alguien está contando de más y hay
// decisiones tomadas sobre un número inflado.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function AttributionStrip({
  ventasReales,
  ordenesReales,
  meta,
  tiktok,
  periodo,
}: {
  ventasReales: number;
  ordenesReales: number;
  meta: { spend: number; purchases: number; revenue: number };
  tiktok: { spend: number; purchases: number; revenue: number };
  periodo: string;
}) {
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

      {exceso != null && exceso > 1.3 && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-warning">
          Entre las dos plataformas se atribuyen {atribuidas.toLocaleString("es-EC")} compras, pero
          en Shopify entraron {ordenesReales.toLocaleString("es-EC")} órdenes:{" "}
          {exceso.toFixed(1)} veces más. Es normal que se solapen —una persona ve el anuncio en
          Meta y compra después de verlo en TikTok, y las dos se lo cuelgan—, pero conviene decidir
          con las órdenes de Shopify, que son las que se cobran.
        </p>
      )}
    </section>
  );
}
