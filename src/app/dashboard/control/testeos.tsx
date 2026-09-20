import type { ResumenTesteos } from "@/lib/testeos";

// La pestaña de testeos del control publicitario.
//
// Contesta dos preguntas que quedaban sueltas: cuántos pedidos de testeo hubo
// —que es exactamente la diferencia entre lo que muestra Shopify y lo que
// cuenta el control— y cuánto se gastó en las campañas en fase de prueba.

const money = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const num = (n: number) => n.toLocaleString("es-EC");

export default function Testeos({
  datos,
  periodo,
  pedidosDelControl,
  verCifras,
}: {
  datos: ResumenTesteos;
  periodo: string;
  pedidosDelControl: number;
  verCifras: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Pedidos de testeo", valor: num(datos.pedidos), nota: periodo },
          {
            label: "Shopify muestra",
            valor: num(pedidosDelControl + datos.pedidos),
            nota: `${num(pedidosDelControl)} del control + ${num(datos.pedidos)} de testeo`,
          },
          ...(verCifras
            ? [
                { label: "Facturado en testeo", valor: money(datos.facturado), nota: "no entra en la utilidad" },
                {
                  label: "Campañas en fase TEST",
                  valor: num(datos.campanasTest),
                  nota: `${money(datos.gastoCampanasTest)} · ver la nota de abajo`,
                },
              ]
            : []),
        ].map((t) => (
          <div key={t.label} className="rounded border border-border bg-surface p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{t.valor}</p>
            <p className="text-xs text-muted">{t.nota}</p>
          </div>
        ))}
      </div>

      <section className="rounded border border-border bg-surface">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Los pedidos de testeo, uno por uno</h2>
          <p className="mt-0.5 text-xs text-muted">
            Es la diferencia exacta entre lo que muestra Shopify y lo que cuenta el control. Se marcan desde «Enlazar
            pedidos»: lo que esté ahí como testeo aparece acá y no suma a la utilidad del mes.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
              <th className="px-5 py-2 font-medium">Producto de testeo</th>
              <th className="px-3 py-2 text-right font-medium">Pedidos</th>
              {verCifras && <th className="px-5 py-2 text-right font-medium">Facturado</th>}
            </tr>
          </thead>
          <tbody>
            {datos.porNombre.map((n) => (
              <tr key={n.nombre} className="border-b border-border/60 last:border-0">
                <td className="px-5 py-2 text-foreground">{n.nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground">{num(n.pedidos)}</td>
                {verCifras && <td className="px-5 py-2 text-right tabular-nums text-muted">{money(n.facturado)}</td>}
              </tr>
            ))}
            {datos.porNombre.length === 0 && (
              <tr>
                <td colSpan={verCifras ? 3 : 2} className="px-5 py-6 text-center text-sm text-muted">
                  No hubo pedidos marcados como testeo en este período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {verCifras && datos.porProducto.length > 0 && (
        <section className="rounded border border-border bg-surface">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Gasto de las campañas en fase de prueba</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Son las campañas con <span className="font-mono text-[11px]">TEST</span> en la nomenclatura. Ojo: acá
              entran también las pruebas de creativos de productos que ya venden —en agosto fueron 825 de 1.179
              campañas—, así que esto no es «plata gastada en productos nuevos», es cuánto se está invirtiendo en
              probar.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 text-right font-medium">Campañas</th>
                <th className="px-3 py-2 text-right font-medium">Compras</th>
                <th className="px-5 py-2 text-right font-medium">Gasto</th>
              </tr>
            </thead>
            <tbody>
              {datos.porProducto.map((p) => (
                <tr key={p.producto} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-2 text-foreground">{p.producto}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{num(p.campanas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{num(p.compras)}</td>
                  <td className="px-5 py-2 text-right tabular-nums text-foreground">{money(p.gasto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
