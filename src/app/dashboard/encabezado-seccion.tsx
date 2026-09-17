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
    <header className="encabezado-entrada relative rounded-xl bg-brand-navy-deep shadow-card">
      {/* Los degradados van dentro de su propio contenedor recortado, y el
          recorte NO está en el <header>.

          Estuvo ahí, y clipeaba todo lo que asomara fuera de la franja: entre
          otras cosas el panel de "Entre dos fechas", que se abre por debajo del
          selector. Se veía una tira gris cortada al ras del borde inferior y
          los dos campos de fecha quedaban invisibles. Se recorta lo que hay que
          recortar —los resplandores, que se extienden -inset-8 para difuminar
          en los bordes— y no el contenido. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl"
      >
        {/* El resplandor evita que el rectángulo oscuro se lea como un bloque
            plano. Respira muy despacio —14 segundos por ciclo— para que la
            pantalla se sienta viva sin robarle atención al título. */}
        <div
          className="encabezado-resplandor absolute -inset-8"
          style={{
            background:
              "radial-gradient(120% 140% at 0% 0%, rgb(0 164 124 / 0.26) 0%, rgb(0 164 124 / 0.07) 38%, transparent 70%)",
          }}
        />
        {/* Un segundo resplandor, desde la esquina opuesta y desfasado: dos
            fuentes de luz dan profundidad donde una sola da un degradado plano. */}
        <div
          className="encabezado-resplandor absolute -inset-8"
          style={{
            background:
              "radial-gradient(90% 120% at 100% 100%, rgb(0 164 124 / 0.14) 0%, transparent 60%)",
            animationDelay: "-7s",
            animationDuration: "18s",
          }}
        />
        <div className="absolute inset-y-0 left-0 w-1 bg-brand-green/70" />
      </div>

      {/* flex-wrap y no `md:flex-row` a secas: el selector de fechas son once
          botones, y en una fila rígida aplastaba el bloque del título hasta
          dejar la fecha en una columna de cuatro renglones. Con wrap, cuando
          las acciones no entran al lado, bajan enteras a la línea siguiente en
          vez de estrujar el texto. */}
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 py-5 md:px-7 md:py-6">
        <div className="min-w-[15rem] flex-1">
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
