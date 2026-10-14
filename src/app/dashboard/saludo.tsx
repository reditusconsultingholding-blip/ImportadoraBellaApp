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

/**
 * El saludo que corresponde a la hora del navegador.
 *
 * Lo usa también el arranque del día, que hasta ahora decía «Buenos días»
 * fijo: a las nueve de la noche el encabezado saludaba «Buenas noches, Alank»
 * y el pop-up, dos centímetros más abajo, «Buenos días, Alank». Dos saludos
 * distintos en la misma pantalla delatan que uno de los dos no está mirando el
 * reloj, y el que no lo miraba era el bonito.
 *
 * Vive acá porque acá está la tabla. Dos tablas de franjas horarias serían dos
 * lugares donde cambiar «Qué madrugón» el día que alguien se canse de él.
 */
export function saludoDeAhora(): string {
  return TEXTO[franjaDelDia() ?? "manana"];
}

/* La hora no cambia por sí sola dentro de una sesión de trabajo: no hace falta
   suscribirse a nada. Lo que sí hace falta es que servidor y navegador den
   respuestas distintas sin que React se queje de la diferencia. */
const nadaQueEscuchar = () => () => {};

export default function Saludo({ nombre }: { nombre: string }) {
  const franja = useSyncExternalStore(nadaQueEscuchar, franjaDelDia, () => null);

  // SOLO EL NOMBRE DE PILA. "Buenos días, Emilia Villegas" suena a carta del
  // banco; "Buenos días, Emilia" suena a alguien que te conoce.
  //
  // La primera versión tomaba dos palabras, pensando en los nombres
  // compuestos. Para la mayoría eso es nombre Y apellido, así que salía el
  // nombre completo — justo lo que se quería evitar: en producción se leyó
  // "Qué madrugón, Alank Vargas". Vale más quedarse corto con un nombre
  // compuesto que tratar de usted a todo el equipo.
  const primerNombre = nombre.trim().split(/\s+/)[0];

  if (!franja) return null;

  return (
    <p className="hidden text-[13px] text-muted lg:block">
      {TEXTO[franja]}, <span className="font-medium text-foreground">{primerNombre}</span>
    </p>
  );
}
