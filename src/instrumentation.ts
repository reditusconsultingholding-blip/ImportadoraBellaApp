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

  const { arrancarReloj } = await import("@/lib/scheduler");
  arrancarReloj();
}
