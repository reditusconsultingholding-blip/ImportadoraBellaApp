// Cada cuánto se dejan calculadas las pantallas en segundo plano.
//
// Antes el panel se recalculaba después de cada vuelta rápida con algo nuevo, y
// las veinte pantallas en cada vuelta lenta, cada cinco minutos, hubiera o no
// alguien mirando. Cada cálculo baja miles de pedidos y métricas de Supabase: el
// 2 de noviembre se medían unas 193.000 filas cada diez minutos y el ciclo iba
// en 122 GB de egress, con el plan gratuito restringido por pasarse de la cuota.
//
// Espaciarlo no muestra números viejos: la memoria se sigue vaciando con cada
// escritura, y una pantalla que no esté calculada se calcula al abrirla con los
// datos del momento. Lo único que se cede es que esa primera apertura tarde unos
// segundos.
export const PRECALENTAR_PANEL_CADA_MS = 15 * 60 * 1000;
export const PRECALENTAR_TODO_CADA_MS = 60 * 60 * 1000;

export function tocaPrecalentar(ultimo: number | undefined, ahora: number, cadaMs: number) {
  return ultimo === undefined || ahora - ultimo >= cadaMs;
}
