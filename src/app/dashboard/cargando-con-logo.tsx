/**
 * El círculo que se ve mientras una pantalla pesada termina de armarse.
 *
 * Lo pidió Sebastián con el ejemplo de Skan-IA, que resolvió lo mismo: «un
 * círculo en la mitad que diga ¡Qué pena la demora! La calidad pesa un poco».
 *
 * QUÉ RESUELVE. Estadísticas CEO tarda entre dos y cuatro segundos en mostrar
 * los números: trae año y medio de campañas y las cruza en el navegador. En ese
 * rato decía «Cargando las campañas del año…» en gris, en el medio de una
 * pantalla vacía — y una línea de texto suelta sobre el vacío se lee como que
 * algo se colgó, no como que está trabajando. Decirlo con una pieza que gira y
 * una frase que explica POR QUÉ tarda cambia la espera de sospecha a paciencia.
 *
 * Es solo CSS y marcado: tiene que pintarse al instante, antes de que corra
 * nada. Si dependiera de JavaScript aparecería justo cuando ya no hace falta.
 */
export default function CargandoConLogo({
  titulo = "¡Qué pena la demora!",
  detalle = "La calidad pesa un poco.",
  alto = "min-h-[22rem]",
}: {
  titulo?: string;
  /** Por qué tarda ESTA pantalla, cuando se sabe. */
  detalle?: string;
  alto?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex ${alto} flex-col items-center justify-center px-6 text-center`}
    >
      <span className="relative flex h-24 w-24 items-center justify-center">
        {/* Dos aros: uno quieto que marca el recorrido completo y otro girando
            con un cuarto sin pintar. Un solo aro girando no se lee como
            progreso, se lee como un borde que parpadea. */}
        <span className="absolute inset-0 rounded-full border-4 border-accent/15" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        {/* La B de Bella, la misma de la pestaña del navegador. Que sea la
            marca y no un engranaje genérico es lo que hace que la espera se
            sienta parte de la herramienta. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" aria-hidden className="h-11 w-11 rounded-xl" />
      </span>

      <p className="mt-6 text-[15px] font-semibold text-foreground">{titulo}</p>
      <p className="mt-1 text-[13px] text-muted">{detalle}</p>
    </div>
  );
}
