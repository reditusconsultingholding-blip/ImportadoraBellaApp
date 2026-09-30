/**
 * Qué versión de Jarvis está sirviendo este proceso.
 *
 * Vive sola porque la leen dos lados que tienen que coincidir: `/api/health`,
 * que dice qué hay publicado, y el panel, que compara contra lo que tiene
 * cargado la pestaña para avisar cuando quedó vieja. Si cada uno la calculara
 * a su manera, la comparación diría que hay versión nueva para siempre.
 *
 * Railway publica el commit en RAILWAY_GIT_COMMIT_SHA sin configurar nada.
 * APP_BUILD queda como opción manual para cualquier otro hosting.
 */
export function versionDeLaApp(): string {
  return (
    process.env.APP_BUILD ??
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ??
    "sin-marcar"
  );
}
