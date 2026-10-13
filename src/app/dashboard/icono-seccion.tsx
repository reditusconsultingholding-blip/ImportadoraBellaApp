/**
 * El ícono de una sección: la pieza verde con el objeto blanco.
 *
 * Reemplaza a los íconos de línea del menú, que eran correctos pero planos y
 * se repetían: veintiuna secciones compartían once dibujos, así que «Panel»,
 * «Estadísticas CEO» y «Origen de las ventas» se veían iguales en la lista.
 * Ahora cada sección tiene el suyo.
 *
 * POR QUÉ EL CHIP CLARO DETRÁS, Y NO EL ÍCONO SUELTO.
 *
 * Las piezas se hicieron con el verde de la marca, que es también el color de
 * la barra lateral y del encabezado. Puestas ahí sin nada detrás, el borde
 * inferior derecho del cuadro —que va al verde profundo— se funde con el fondo
 * y el objeto blanco queda flotando sin silueta: se pierde justo lo que hace
 * que se lea como una pieza. Se probaron cuatro tratamientos sobre el fondo
 * real (#001b16) y el que devuelve el contraste es un chip claro detrás.
 *
 * Por eso `tono`: sobre fondo oscuro la pieza va sobre blanco; sobre fondo
 * claro va desnuda, que ahí sí contrasta sola.
 */
import type { CSSProperties } from "react";

export type TonoIcono = "oscuro" | "claro";

export function IconoSeccion({
  nombre,
  tono = "oscuro",
  tamano = 20,
  activo = false,
  className = "",
}: {
  /** El archivo en /public/iconos, sin extensión. */
  nombre: string;
  /** Sobre qué fondo se va a ver. Decide si lleva chip claro detrás. */
  tono?: TonoIcono;
  /** El lado de la pieza, en píxeles. */
  tamano?: number;
  /** La sección en la que se está. Enciende el latido. */
  activo?: boolean;
  className?: string;
}) {
  // El chip crece un poco más que la pieza para que se vea el marco.
  const marco = tono === "oscuro" ? Math.round(tamano * 1.34) : tamano;
  const estilo: CSSProperties = { width: marco, height: marco };

  return (
    <span
      className={`icono-seccion relative inline-flex shrink-0 items-center justify-center ${
        tono === "oscuro"
          ? "rounded-[30%] bg-white/92 shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
          : ""
      } ${activo ? "icono-activo" : ""} ${className}`}
      style={estilo}
    >
      {/* El latido del ícono de la sección en la que estás: el mismo aro que
          se expande de la pantalla de carga, al 60 % de su fuerza. Marca dónde
          estás sin agregar otro color ni otra forma al menú. */}
      {activo && (
        <span
          aria-hidden
          className="icono-pulso pointer-events-none absolute -inset-1 rounded-[30%] border border-brand-green"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/iconos/${nombre}.png`}
        alt=""
        aria-hidden
        draggable={false}
        width={tamano}
        height={tamano}
        className="icono-pieza select-none rounded-[26%]"
        style={{ width: tamano, height: tamano }}
      />
    </span>
  );
}
