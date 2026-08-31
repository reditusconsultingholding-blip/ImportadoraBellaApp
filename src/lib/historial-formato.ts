// Los tipos y el formato del historial de decisiones, sin tocar la base.
//
// Vive separado de `historial-decisiones.ts` porque la pantalla que lo muestra
// es un componente de cliente: si importara el módulo que abre Prisma, el
// cliente entero se arrastraría al bundle del navegador.

export type Desenlace = "PENDIENTE" | "ACEPTADA" | "NEGADA";

/** De qué mecanismo salió la propuesta. Conviven dos, y no se pueden mezclar. */
export type OrigenPropuesta = "PRODUCTO" | "JARVIS";

export type EntradaHistorial = {
  id: string;
  origen: OrigenPropuesta;
  /** Etiqueta legible del tipo de pedido. */
  tipo: string;
  /** Qué se propuso exactamente. */
  detalle: string;
  /** El número o la razón que lo justificaba. */
  motivo: string;
  pedidaPor: string;
  /** Instante real, en ISO. */
  pedidaEl: string;
  desenlace: Desenlace;
  /**
   * Lo que el desenlace solo no cuenta: aprobada pero sin ejecutar, ejecutada,
   * fallada al ejecutarse. Se separa del desenlace para no inventar una cuarta
   * columna de estado que el negocio no usa.
   */
  matiz: string | null;
  resueltaPor: string | null;
  resueltaEl: string | null;
  nota: string | null;
  /**
   * Si el mecanismo de origen tiene dónde guardar una nota al resolver.
   * Cuando es `false`, la ausencia de nota no significa que nadie la escribió:
   * significa que no había dónde escribirla. La pantalla lo dice con esas
   * palabras en vez de mostrar un guion que se lee como descuido.
   */
  admiteNota: boolean;
  /** Si se puede aceptar o negar desde esta misma pantalla. */
  resolubleAqui: boolean;
  asignadaA: string | null;
  cantidad: number | null;
  /** Cuántos creativos nacieron de la acción, cuando nacieron. */
  creativos: number | null;
};

export const DESENLACES: Record<
  Desenlace,
  { palabra: string; chip: string; ayuda: string }
> = {
  // El color va siempre acompañado de la palabra: en una pantalla de
  // trazabilidad, "verde" y "rojo" tienen que poder leerse también en blanco y
  // negro, o por alguien que no distingue los dos.
  PENDIENTE: {
    palabra: "Pendiente",
    chip: "border-warning/30 bg-surface-2 text-warning",
    ayuda: "Todavía espera una decisión de dirección",
  },
  ACEPTADA: {
    palabra: "Aceptada",
    chip: "border-good/30 bg-good-bg text-good",
    ayuda: "Dirección la aprobó",
  },
  NEGADA: {
    palabra: "Negada",
    chip: "border-critical/30 bg-critical-bg text-critical",
    ayuda: "Dirección la rechazó",
  },
};

// La zona del negocio, no la del servidor. Railway corre en UTC y estas son
// marcas de instante real (`now()`), no marcas de día como las de
// `date-range.ts`: sin fijar la zona, una decisión tomada a las 20:00 en
// Guayaquil aparecería fechada al día siguiente.
const ZONA = "America/Guayaquil";

export function fechaHoraEcuador(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "fecha ilegible";
  return d.toLocaleString("es-EC", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONA,
  });
}
