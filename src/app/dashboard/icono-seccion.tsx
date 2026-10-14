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
  // UN FILO DE BLANCO, NO UN MARCO.
  //
  // Empezó en 1,34 y bajó a 1,26; sigue siendo demasiado. Con 2,5 píxeles de
  // blanco por lado, el chip se lee como un cuadro con algo adentro en vez de
  // como la pieza misma, y el aire se nota más en las esquinas que en los
  // lados —dos redondeados concéntricos de radios distintos— así que parece
  // descentrado aunque esté centrado al píxel. Sebastián: "el emoji debe
  // quedar en toda la mitad del cuadro blanco, no como en un lado".
  //
  // 1,14 deja un filo de un píxel y medio: alcanza para devolverle la silueta
  // que el fondo verde se come, que es para lo único que está.
  const marco = tono === "oscuro" ? Math.round(tamano * 1.14) : tamano;
  const estilo: CSSProperties = { width: marco, height: marco };

  return (
    <span
      className={`icono-seccion relative inline-flex shrink-0 items-center justify-center ${
        tono === "oscuro"
          ? "rounded-[28%] bg-white/92 shadow-[0_1px_2px_rgb(0_0_0/0.25)]"
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
      {/* EL BLANCO DE LA PRIMERA CARGA.
          //
          // Sebastián: "los iconos se quedan en blanco y después aparecen". El
          // chip se pinta con el HTML y la pieza llega después, así que por un
          // momento el menú es una columna de cuadritos vacíos.
          //
          // Dos cosas lo arreglan, y ninguna es un truco: las piezas pasaron de
          // 128 a 80 píxeles --se muestran a 20 y a 34, así que 80 alcanza aun
          // en pantallas de densidad doble-- y de PNG a WebP, que con
          // transparencia pesa cuatro veces menos: el conjunto bajó de 438 KB a
          // 47. Con PNG la última pieza seguía llegando 880 ms después de que
          // la pantalla estuviera lista, porque son diecinueve peticiones
          // compitiendo. Y se le dice al navegador que no las deje para el
          // final:
          // `fetchPriority` alta y decodificación inmediata, porque son lo
          // primero que se ve y pesan diez kilobytes. */}
      {/* EL CUADRO VERDE DEBAJO DE LA PIEZA.
          //
          // Reducir el peso ayudó --de 438 KB a 47, y la espera de 880 ms a
          // 600-- pero no borra el síntoma: lo que molesta no es que la pieza
          // tarde, es que mientras tanto se ve BLANCO. Son diecinueve
          // peticiones, y por rápidas que sean hay un momento con los chips
          // vacíos.
          //
          // Esto pinta debajo el mismo degradado verde que tienen las piezas,
          // del mismo tamaño y con el mismo radio. Mientras la imagen viaja se
          // ve un cuadrito verde --que es como se ve una pieza sin su objeto--
          // y cuando llega, la tapa. El salto deja de existir aunque la espera
          // siga ahí: no hay nada que esperar que se note. */}
      <span
        aria-hidden
        className="absolute rounded-[28%]"
        style={{
          width: tamano,
          height: tamano,
          background: "linear-gradient(135deg, #00b98b 0%, #00a47c 55%, #00674f 100%)",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/iconos/${nombre}.webp`}
        alt=""
        aria-hidden
        draggable={false}
        loading="eager"
        decoding="sync"
        fetchPriority="high"
        width={tamano}
        height={tamano}
        className="icono-pieza relative select-none rounded-[28%]"
        style={{ width: tamano, height: tamano }}
      />
    </span>
  );
}
