// El nombre de la cookie vive solo, sin importar nada más, porque lo necesitan
// dos mundos distintos: el middleware (que corre en el runtime edge y no puede
// tocar Prisma) y auth.ts (que sí consulta la base). Si estuvieran juntos, el
// middleware arrastraría el cliente de base de datos a un entorno donde no
// puede correr.
export const SESSION_COOKIE_NAME = "jarvis_session";
