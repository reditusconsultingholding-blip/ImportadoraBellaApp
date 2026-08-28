import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// El cliente se construye la primera vez que alguien lo usa, no al importar
// el módulo. Durante `next build` se importan todas las rutas para recolectar
// sus metadatos: si aquí se abriera la conexión (o se tirara el error por falta
// de DATABASE_URL), el build fallaría aunque en producción la variable exista.
//
// Se guarda en un global porque Next recarga los módulos en cada cambio
// durante el desarrollo, y sin eso se abriría un pool de conexiones nuevo
// cada vez.
function getClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL. Es la cadena de conexión de Supabase (Project Settings → Database → Connection string, modo Transaction)."
    );
  }

  globalForPrisma.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
