"use client";

import { usePathname } from "next/navigation";
import { IconoSeccion, type TonoIcono } from "./icono-seccion";

/**
 * El ícono de la pantalla en la que estás, deducido de la dirección.
 *
 * POR QUÉ DE LA RUTA Y NO COMO PROPIEDAD. El encabezado lo usan veintiuna
 * pantallas. Pasarle el ícono a cada una significa veintiún lugares donde
 * olvidarse de ponerlo cuando se agregue una sección, y una tabla repartida en
 * veintiún archivos. Acá hay una sola tabla y ninguna pantalla que actualizar.
 *
 * Es la misma idea que resolvió esto en Skan-IA: la imagen sale de la
 * navegación, no de cada vista.
 */

/**
 * Qué pieza le toca a cada sección.
 *
 * El orden importa: se recorre de la ruta más larga a la más corta, porque
 * "/dashboard" es prefijo de todas las demás y si se evaluara primero se
 * quedaría con todas.
 */
const PIEZAS: [string, string][] = [
  ["/dashboard/sin-nomenclatura", "sin-nomenclatura"],
  ["/dashboard/notificaciones", "notificaciones"],
  ["/dashboard/configuracion", "configuracion"],
  ["/dashboard/rentabilidad", "rentabilidad"],
  ["/dashboard/calculadora", "calculadora"],
  ["/dashboard/conexiones", "conexiones"],
  ["/dashboard/desempeno", "desempeno"],
  ["/dashboard/contenido", "contenido"],
  ["/dashboard/logistica", "logistica"],
  ["/dashboard/productos", "productos"],
  ["/dashboard/reportes", "reportes"],
  ["/dashboard/clientes", "clientes"],
  ["/dashboard/usuarios", "usuarios"],
  ["/dashboard/control", "control"],
  ["/dashboard/origen", "origen"],
  ["/dashboard/jarvis", "jarvis"],
  ["/dashboard/nomina", "nomina"],
  ["/dashboard/pagos", "pagos"],
  ["/dashboard/chat", "chat"],
  ["/dashboard/ceo", "ceo"],
  ["/dashboard", "panel"],
];

/** La pieza que corresponde a una dirección, o null si no hay ninguna. */
export function piezaDeRuta(ruta: string): string | null {
  for (const [prefijo, pieza] of PIEZAS) {
    if (ruta === prefijo || ruta.startsWith(prefijo + "/")) return pieza;
  }
  return null;
}

export default function IconoDeRuta({
  tono = "oscuro",
  tamano = 44,
  className = "",
}: {
  tono?: TonoIcono;
  tamano?: number;
  className?: string;
}) {
  const ruta = usePathname() ?? "";
  const pieza = piezaDeRuta(ruta);
  if (!pieza) return null;
  return <IconoSeccion nombre={pieza} tono={tono} tamano={tamano} className={className} />;
}
