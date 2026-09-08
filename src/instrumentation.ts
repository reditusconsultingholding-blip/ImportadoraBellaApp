// Se ejecuta una vez cuando arranca el servidor, antes de atender el primer
// pedido. Next lo llama solo si el archivo se llama así y está en la raíz de
// src — es el único lugar donde se puede enganchar el arranque.

export async function register() {
  // Solo en el proceso de Node. Next también evalúa la instrumentación en el
  // runtime edge, donde no hay ni intervalos ni acceso a la base.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Durante `next build` también se importa este archivo. Arrancar un reloj
  // ahí dejaría un intervalo vivo y la compilación no terminaría nunca.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // En desarrollo el reloj queda apagado salvo que se pida a propósito.
  //
  // `npm run dev` se corre con el DATABASE_URL de producción —es la única
  // base que hay— y hasta ahora eso significaba que abrir la app en la
  // máquina de alguien empezaba a sincronizar contra Meta, TikTok y Shopify,
  // a generar reportes y a mandarle notificaciones al equipo. Dos personas
  // trabajando en local eran dos relojes de más pisando los mismos datos.
  //
  // Para probar el reloj en local: RELOJ_EN_DESARROLLO=1 npm run dev
  if (process.env.NODE_ENV !== "production" && process.env.RELOJ_EN_DESARROLLO !== "1") {
    console.log("[reloj] apagado en desarrollo (RELOJ_EN_DESARROLLO=1 para encenderlo)");
    return;
  }

  const { arrancarReloj } = await import("@/lib/scheduler");
  arrancarReloj();
}
