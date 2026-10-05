"use client";

import { useSyncExternalStore } from "react";

/**
 * «Buenos días, Emilia.»
 *
 * Es lo único de la interfaz que le habla a la persona y no al negocio. Suena
 * a detalle menor y no lo es: quien abre esto a las siete de la mañana, todos
 * los días, para cargar piezas o revisar el CPA, está usando una herramienta
 * que hasta ahora no sabía quién era. Una app que te nombra se siente tuya.
 *
 * LA HORA SE CALCULA EN EL NAVEGADOR, no en el servidor. El servidor corre en
 * otro huso y diría "buenas noches" a alguien que está desayunando en
 * Guayaquil. Por eso se lee con useSyncExternalStore y con un valor distinto
 * para el servidor: durante el primer dibujado no hay hora confiable, así que
 * no se saluda, y el saludo aparece en cuanto el navegador toma el control.
 * Un saludo equivocado es peor que ninguno.
 */

function franjaDelDia(): "madrugada" | "manana" | "tarde" | "noche" | null {
  const h = new Date().getHours();
  if (h < 5) return "madrugada";
  if (h < 12) return "manana";
  if (h < 19) return "tarde";
  return "noche";
}

const TEXTO = {
  madrugada: "Qué madrugón",
  manana: "Buenos días",
  tarde: "Buenas tardes",
  noche: "Buenas noches",
} as const;

/* La hora no cambia por sí sola dentro de una sesión de trabajo: no hace falta
   suscribirse a nada. Lo que sí hace falta es que servidor y navegador den
   respuestas distintas sin que React se queje de la diferencia. */
const nadaQueEscuchar = () => () => {};

export default function Saludo({ nombre }: { nombre: string }) {
  const franja = useSyncExternalStore(nadaQueEscuchar, franjaDelDia, () => null);

  // El primer nombre alcanza. "Buenos días, Maria Jose Loor" suena a carta del
  // banco; "Buenos días, Maria Jose" suena a alguien que te conoce.
  const primerNombre = nombre.trim().split(/\s+/).slice(0, 2).join(" ");

  if (!franja) return null;

  return (
    <p className="hidden text-[13px] text-muted lg:block">
      {TEXTO[franja]}, <span className="font-medium text-foreground">{primerNombre}</span>
    </p>
  );
}
