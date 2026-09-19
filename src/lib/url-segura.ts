// Los enlaces que escribe el equipo (referencias, repositorio, anclajes,
// fijados del chat, el documento de administración) se muestran como <a>.
// Solo se dejan pasar http y https: un "javascript:..." guardado en uno de
// esos campos correría código en la sesión de quien lo abra. React 19 ya
// bloquea javascript:, pero no data: ni otros esquemas raros, y esta es la
// capa que no depende de la versión de React.
export function urlSegura(url: string | null | undefined): string {
  if (!url) return "#";
  const u = url.trim();
  if (/^https?:\/\//i.test(u)) return u;
  // Sin esquema ("drive.google.com/...") es lo que la gente pega a menudo.
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return `https://${u}`;
  return "#";
}
