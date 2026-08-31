import LinkCargando from "../link-cargando";

// Las cuatro vistas del pipeline. El nombre de la vista viaja en la URL y no
// en estado del navegador: así cada pestaña le pide al servidor solo sus
// datos —el tablero no baja el pulso de creativos ni al revés— y un link a
// "Todos los productos" se puede pegar en el chat y abre donde debe.

export const VISTAS = ["kanban", "tabla", "campanas", "productos"] as const;

export type Vista = (typeof VISTAS)[number];

export const esVista = (v: string | undefined): v is Vista =>
  VISTAS.includes(v as Vista);

const ETIQUETAS: { id: Vista; label: string; ayuda: string }[] = [
  { id: "kanban", label: "Kanban", ayuda: "Las piezas por situación, arrastrables" },
  { id: "tabla", label: "Tabla", ayuda: "Las mismas piezas con todas sus columnas" },
  { id: "campanas", label: "Campañas activas", ayuda: "Lo que está corriendo y gastando hoy" },
  {
    id: "productos",
    label: "Todos los productos",
    ayuda: "Cuáles piden creativos nuevos y cuáles aguantan más",
  },
];

export default function VistaTabs({ activa }: { activa: Vista }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
      {ETIQUETAS.map((t) => {
        const on = t.id === activa;
        return (
          <LinkCargando
            key={t.id}
            href={`/dashboard/pipeline?vista=${t.id}`}
            title={t.ayuda}
            ariaCurrent={on ? "page" : undefined}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
              on
                ? "bg-surface text-foreground shadow-[0_1px_2px_0_rgb(26_26_26_/_0.08)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </LinkCargando>
        );
      })}
    </div>
  );
}
