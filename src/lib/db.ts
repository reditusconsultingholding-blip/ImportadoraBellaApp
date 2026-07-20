import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaReady?: Promise<void>;
};

// Sin DATABASE_URL (ej. este preview de demo, todavía sin Postgres real)
// corremos en SQLite en memoria: cada arranque en frío se auto-migra y
// se auto-siembra con los datos de ejemplo de Importadora Bella. Los
// datos no sobreviven a un cold start nuevo — para eso hace falta una
// base real (ver README).
const DEMO_MODE = !process.env.DATABASE_URL;

function makeClient() {
  const adapter = new PrismaBetterSqlite3({
    url: DEMO_MODE ? ":memory:" : (process.env.DATABASE_URL as string),
  });
  return new PrismaClient({ adapter });
}

const rawClient = globalForPrisma.prisma ?? makeClient();
globalForPrisma.prisma = rawClient;

function ensureReady(): Promise<void> {
  if (!DEMO_MODE) return Promise.resolve();
  if (!globalForPrisma.prismaReady) {
    globalForPrisma.prismaReady = (async () => {
      const { seedDemoDatabase } = await import("./demo-seed");
      await seedDemoDatabase(rawClient);
    })();
  }
  return globalForPrisma.prismaReady;
}

// Evitamos un top-level await acá (rompe el bundling de Turbopack en
// algunos contextos de server component). En cambio, cada llamada real
// al cliente espera a que termine la siembra en memoria antes de correr.
function wrapModel<T extends object>(model: T): T {
  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        await ensureReady();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

export const db = new Proxy(rawClient, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      return async (...args: unknown[]) => {
        await ensureReady();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    }
    if (value && typeof value === "object") {
      return wrapModel(value);
    }
    return value;
  },
}) as PrismaClient;
