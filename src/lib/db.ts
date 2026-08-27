import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Postgres (Supabase en producción). Se guarda una sola instancia por
// proceso: Next recarga los módulos en cada cambio durante el desarrollo,
// y sin este global se abriría un pool de conexiones nuevo cada vez.
function makeClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL. Copiá la cadena de conexión de Supabase (Project Settings → Database → Connection string) al .env."
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db: PrismaClient = globalForPrisma.prisma ?? makeClient();
globalForPrisma.prisma = db;
