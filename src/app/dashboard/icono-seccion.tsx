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

/**
 * El orden de las piezas dentro de la tira.
 *
 * Las veintiuna viven en una sola imagen —`piezas.webp`, 80 × 1680— y cada una
 * se muestra corriendo el fondo hacia arriba: la número N va en `-N × tamaño`
 * píxeles. El índice de este arreglo ES esa posición.
 *
 * POR QUÉ UNA SOLA IMAGEN. Veintiún archivos de dos kilobytes son veintiuna
 * peticiones, y eso tiene un piso que no se baja comprimiendo: medido en vivo,
 * la última llegaba seiscientos milisegundos después de que la pantalla
 * estuviera lista. Una petición de 38 KB llega entera o no llega.
 *
 * ESTE ORDEN ESTÁ TAMBIÉN EN `scripts/armar-tira-iconos.cjs`, y los dos tienen
 * que decir lo mismo: si se separan, cada sección muestra el ícono de otra sin
 * que falle nada. Por eso el script imprime la lista al terminar. Las piezas
 * nuevas se agregan AL FINAL —meter una al medio corre todas las de abajo— y
 * después se vuelve a correr el script.
 */
const PIEZAS = [
  "panel",
  "ceo",
  "contenido",
  "productos",
  "sin-nomenclatura",
  "control",
  "rentabilidad",
  "clientes",
  "origen",
  "calculadora",
  "pagos",
  "reportes",
  "logistica",
  "nomina",
  "chat",
  "notificaciones",
  "jarvis",
  "conexiones",
  "configuracion",
  "usuarios",
  "desempeno",
] as const;

export function IconoSeccion({
  nombre,
  tono = "oscuro",
  tamano = 20,
  activo = false,
  className = "",
}: {
  /** Cuál de las piezas de la tira. Ver `PIEZAS`. */
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
  const indice = (PIEZAS as readonly string[]).indexOf(nombre);

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
      {/* LA PIEZA ES UN FONDO, NO UNA IMAGEN SUELTA.
          //
          // Las veintiuna están en un solo archivo y acá se muestra la porción
          // que toca, corriendo el fondo hacia arriba. Una petición en vez de
          // veintiuna.
          //
          // EL DEGRADADO VERDE VA DEBAJO, Y SIGUE HACIENDO FALTA. Aunque ahora
          // sea una sola petición, sigue habiendo un momento sin ella: lo que
          // molestaba no era que la pieza tardara sino que mientras tanto se
          // viera BLANCO. Con el verde debajo se ve un cuadrito verde —que es
          // como se ve una pieza sin su objeto— y cuando la tira llega, la
          // tapa. El salto deja de existir aunque la espera siga ahí.
          //
          // Un nombre que no esté en la tira no pinta ninguna porción: se
          // queda en el cuadro verde, que es un degradado de la marca y no un
          // hueco. Es lo que corresponde para algo que se agregó a medias. */}
      <span
        aria-hidden
        className="relative block rounded-[28%]"
        style={{
          width: tamano,
          height: tamano,
          background: "linear-gradient(135deg, #00b98b 0%, #00a47c 55%, #00674f 100%)",
          backgroundImage:
            indice >= 0
              ? `url(/iconos/piezas.webp), linear-gradient(135deg, #00b98b 0%, #00a47c 55%, #00674f 100%)`
              : undefined,
          backgroundSize: indice >= 0 ? `${tamano}px ${tamano * PIEZAS.length}px, 100% 100%` : undefined,
          backgroundPosition: indice >= 0 ? `0 ${-tamano * indice}px, 0 0` : undefined,
          backgroundRepeat: "no-repeat",
        }}
      />
    </span>
  );
}
