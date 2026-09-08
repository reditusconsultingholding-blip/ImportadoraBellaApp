import type { ReactNode } from "react";

/**
 * La cabecera de una pantalla del panel.
 *
 * Antes cada pantalla abría con un `<h1>` suelto sobre el fondo gris: el título
 * competía con las tarjetas de abajo y ninguna pantalla se distinguía de otra.
 * Esto le da a cada una una franja verde propia —la marca— y separa el "dónde
 * estoy" del contenido.
 *
 * `eyebrow` sitúa la pantalla dentro del panel (PRODUCCIÓN, NÚMEROS…), las
 * mismas familias que agrupan el menú lateral.
 */
export function EncabezadoSeccion({
  eyebrow,
  titulo,
  descripcion,
  insignia,
  acciones,
}: {
  /** Línea pequeña en mayúsculas, arriba del título. */
  eyebrow: string;
  titulo: string;
  descripcion?: ReactNode;
  /** Pastilla al lado del título: el rol, el estado, el periodo. */
  insignia?: ReactNode;
  /** Controles a la derecha: selector de rango, botones. */
  acciones?: ReactNode;
}) {
  return (
    <header className="encabezado-entrada relative overflow-hidden rounded-xl bg-brand-navy-deep shadow-card">
      {/* El resplandor evita que el rectángulo oscuro se lea como un bloque
          plano. Respira muy despacio —14 segundos por ciclo— para que la
          pantalla se sienta viva sin robarle atención al título. Va detrás del
          contenido y no intercepta clics. */}
      <div
        aria-hidden
        className="encabezado-resplandor pointer-events-none absolute -inset-8"
        style={{
          background:
            "radial-gradient(120% 140% at 0% 0%, rgb(0 164 124 / 0.26) 0%, rgb(0 164 124 / 0.07) 38%, transparent 70%)",
        }}
      />
      {/* Un segundo resplandor, desde la esquina opuesta y desfasado: dos
          fuentes de luz dan profundidad donde una sola da un degradado plano. */}
      <div
        aria-hidden
        className="encabezado-resplandor pointer-events-none absolute -inset-8"
        style={{
          background:
            "radial-gradient(90% 120% at 100% 100%, rgb(0 164 124 / 0.14) 0%, transparent 60%)",
          animationDelay: "-7s",
          animationDuration: "18s",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-brand-green/70"
      />

      <div className="relative flex flex-col gap-4 px-5 py-5 md:flex-row md:items-end md:justify-between md:px-7 md:py-6">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-green">
            {eyebrow}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-white md:text-[25px]">
              {titulo}
            </h1>
            {insignia}
          </div>

          {descripcion ? (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-white/55">
              {descripcion}
            </p>
          ) : null}
        </div>

        {acciones ? <div className="flex shrink-0 flex-wrap gap-2">{acciones}</div> : null}
      </div>
    </header>
  );
}

/** Pastilla para `insignia`. Legible sobre el verde oscuro, no sobre blanco. */
export function InsigniaEncabezado({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/85">
      {children}
    </span>
  );
}
