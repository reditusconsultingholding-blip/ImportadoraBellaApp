import type { RitmoVentas } from "@/lib/ritmo-ventas";

// La tira de arriba del panel: lo que se mira primero, sin bajar.
//
// POR QUÉ EXISTE
// Los números estaban todos, pero repartidos: las ventas en su bloque, el
// gasto de cada plataforma más abajo, y la hora en que compra la gente no
// estaba en ninguna parte —había que ir a buscarla a Shopify—. Quien abre el
// panel quiere cuatro cosas de un vistazo: cuántas ventas van, a qué costo,
// cómo viene el ritmo y a qué hora compran.
//
// SIN EL PERMISO DE FINANZAS
// Las ventas, el ritmo y las horas se ven igual; el gasto y los CPA no se
// dibujan. Es el mismo criterio del resto del panel.

const money0 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const money2 = (n: number) =>
  n.toLocaleString("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const numero = (n: number) => n.toLocaleString("es-EC");

/** "8 a 9 h" — la franja de una hora, escrita como la diría alguien. */
function franja(hora: number) {
  return `${hora} a ${hora + 1} h`;
}

function Dato({
  etiqueta,
  valor,
  nota,
  acento,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  acento?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{etiqueta}</p>
      <p className={`mt-0.5 truncate text-[19px] font-semibold tabular-nums ${acento ? "text-accent-strong" : "text-foreground"}`}>
        {valor}
      </p>
      {nota && <p className="truncate text-[11px] text-muted">{nota}</p>}
    </div>
  );
}

export default function IndicadoresRapidos({
  ritmo,
  periodo,
  verCifras,
  meta,
  tiktok,
  hoy,
}: {
  ritmo: RitmoVentas;
  periodo: string;
  verCifras: boolean;
  meta: { spend: number; purchases: number };
  tiktok: { spend: number; purchases: number };
  /** Cómo viene el día, cuando el período elegido no es hoy. */
  hoy: { ritmo: RitmoVentas; gasto: number; conGasto: boolean } | null;
}) {
  const gasto = meta.spend + tiktok.spend;
  // El CPA que usa el equipo: todo el gasto sobre los pedidos REALES de la
  // tienda. El de cada plataforma va aparte, sobre lo que ella se atribuye.
  const cpa = ritmo.ordenes > 0 ? gasto / ritmo.ordenes : 0;
  const cpaMeta = meta.purchases > 0 ? meta.spend / meta.purchases : null;
  const cpaTiktok = tiktok.purchases > 0 ? tiktok.spend / tiktok.purchases : null;

  const mejores = ritmo.mejores;
  const pico = mejores[0];
  const cpaHoy = hoy && hoy.ritmo.ordenes > 0 ? hoy.gasto / hoy.ritmo.ordenes : null;

  return (
    <section aria-label={`Indicadores rápidos · ${periodo}`} className="flex flex-col gap-2">
      {/* El día de hoy, aunque el filtro esté en otro período. Es la pregunta
          que más se hace y obligaba a cambiar el rango y volverlo a dejar. */}
      {hoy && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-accent/30 bg-good-bg/40 px-3 py-2 text-[12px]">
          <span className="rounded-full bg-accent-strong px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-background">
            Hoy
          </span>
          <span className="text-foreground">
            <span className="font-semibold tabular-nums">{numero(hoy.ritmo.ordenes)}</span> ventas
          </span>
          <span className="text-muted">
            <span className="font-semibold tabular-nums text-foreground">{hoy.ritmo.porHoraPromedio.toFixed(1)}</span> por
            hora
          </span>
          {hoy.conGasto && (
            <>
              <span className="text-muted">
                gasto <span className="font-semibold tabular-nums text-foreground">{money0(hoy.gasto)}</span>
              </span>
              <span className="text-muted">
                CPA <span className="font-semibold tabular-nums text-foreground">{cpaHoy ? money2(cpaHoy) : "—"}</span>
              </span>
              <span className="text-muted">
                facturado <span className="font-semibold tabular-nums text-foreground">{money0(hoy.ritmo.facturado)}</span>
              </span>
            </>
          )}
          {hoy.ritmo.mejores[0] && (
            <span className="text-muted/80">pico {franja(hoy.ritmo.mejores[0].hora)}</span>
          )}
        </div>
      )}
      <div className={`grid grid-cols-2 gap-2 ${verCifras ? "lg:grid-cols-5" : "lg:grid-cols-3"}`}>
        <Dato
          etiqueta="Ventas"
          valor={numero(ritmo.ordenes)}
          nota={verCifras ? money0(ritmo.facturado) : periodo}
          acento
        />
        <Dato
          etiqueta="Ventas por hora"
          valor={ritmo.porHoraPromedio.toFixed(1)}
          nota="promedio del período"
        />
        {verCifras && <Dato etiqueta="CPA promedio" valor={cpa > 0 ? money2(cpa) : "—"} nota="gasto ÷ ventas reales" />}
        {verCifras && (
          <Dato
            etiqueta="Meta"
            valor={money0(meta.spend)}
            nota={cpaMeta ? `CPA ${money2(cpaMeta)} · ${numero(meta.purchases)} compras` : "sin compras atribuidas"}
          />
        )}
        {verCifras && (
          <Dato
            etiqueta="TikTok"
            valor={money0(tiktok.spend)}
            nota={cpaTiktok ? `CPA ${money2(cpaTiktok)} · ${numero(tiktok.purchases)} compras` : "sin compras atribuidas"}
          />
        )}
        {!verCifras && pico && <Dato etiqueta="Hora pico" valor={franja(pico.hora)} nota={`${numero(pico.ordenes)} ventas`} />}
      </div>

      {/* La recomendación corta. Sale de los datos del período elegido, no de
          una regla general: en Ecuador este negocio vende de mañana, y eso no
          es lo que dice cualquier manual de ecommerce. */}
      {mejores.length > 0 && (
        <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[12px] leading-relaxed text-muted">
          <span className="font-semibold text-foreground">A qué hora compran:</span>{" "}
          {mejores.map((h, i) => (
            <span key={h.hora}>
              {i > 0 ? (i === mejores.length - 1 ? " y " : ", ") : ""}
              <span className="font-semibold text-foreground">{franja(h.hora)}</span> ({numero(h.ordenes)})
            </span>
          ))}
          . Ahí entra el {Math.round(ritmo.porcionMejores * 100)}% de las ventas del período.
          {pico && (
            <>
              {" "}
              Conviene que el presupuesto no se haya gastado antes de las {pico.hora} h y revisar la pauta a primera
              hora, no al mediodía.
            </>
          )}{" "}
          <span className="text-muted/70">
            Meta y TikTok informan el gasto por día, así que esta comparación es sobre las ventas de la tienda.
          </span>
        </p>
      )}
    </section>
  );
}
