/**
 * El círculo que se ve mientras una pantalla pesada termina de armarse.
 *
 * Lo pidió Sebastián con el ejemplo de Skan-IA, que resolvió lo mismo: «un
 * círculo en la mitad que diga ¡Qué pena la demora! La calidad pesa un poco».
 * Más tarde, viendo las secciones que seguían sin nada: «cuando esté cargando
 * salga la bolita cargando en la mitad y en la mitad el logo, y diga un
 * momento, la calidad pesa un poco».
 *
 * QUÉ RESUELVE. Las pantallas pesadas tardan entre dos y cuatro segundos:
 * Estadísticas CEO trae año y medio de campañas, el Control cruza los pedidos
 * reales con el gasto de dos plataformas. En ese rato, doce de las veintiuna
 * secciones no mostraban nada —dejaban congelada la pantalla ANTERIOR, que es
 * peor que el vacío: parece que el clic no se registró— y las otras nueve
 * mostraban bloques grises que Sebastián describió como "en blanco y feo".
 *
 * Decirlo con una pieza que gira y una frase que explica POR QUÉ tarda cambia
 * la espera de sospecha a paciencia.
 *
 * Es solo CSS y marcado: tiene que pintarse al instante, antes de que corra
 * nada. Si dependiera de JavaScript aparecería justo cuando ya no hace falta.
 */
export default function CargandoConLogo({
  titulo = "Un momento…",
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
      className={`relative flex ${alto} flex-col items-center justify-center overflow-hidden px-6 text-center`}
    >
      {/* El resplandor de atrás: la misma luz verde del encabezado, muy abierta
          y muy tenue. Sin él la pieza queda flotando sobre un blanco plano y se
          lee como un error de carga; con él, el vacío tiene profundidad. Respira
          a 14 segundos por ciclo, igual que el encabezado, para que sea el mismo
          sistema y no un efecto suelto. */}
      <span
        aria-hidden
        className="encabezado-resplandor pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            "radial-gradient(closest-side, rgb(0 164 124 / 0.14) 0%, rgb(0 164 124 / 0.05) 45%, transparent 72%)",
        }}
      />

      <span className="relative flex h-24 w-24 items-center justify-center">
        {/* Tres aros, de afuera hacia adentro: el pulso, que se expande y se
            desvanece —es lo que da la sensación de actividad y no de espera—;
            el recorrido completo, quieto, contra el que se mide el giro; y el
            que gira con un cuarto sin pintar. Un solo aro girando no se lee
            como progreso, se lee como un borde que parpadea. */}
        <span className="absolute -inset-3 animate-[pulso-carga_2.2s_ease-out_infinite] rounded-full border border-accent/40" />
        <span className="absolute inset-0 rounded-full border-4 border-accent/15" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-accent border-t-transparent" />
        {/* La B de Bella, la misma de la pestaña del navegador. Que sea la
            marca y no un engranaje genérico es lo que hace que la espera se
            sienta parte de la herramienta.
            //
            // Es redonda, así que va sin `rounded`: recortar en redondo algo
            // que ya es un círculo le come los bordes. Y por eso mismo queda
            // concéntrica con los aros que giran alrededor. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/iconos/marca-b.png" alt="" aria-hidden className="h-12 w-12" />
      </span>

      <p className="relative mt-6 text-[15px] font-semibold text-foreground">{titulo}</p>
      <p className="relative mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{detalle}</p>
    </div>
  );
}
