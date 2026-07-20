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

const isFreshClient = !globalForPrisma.prisma;
export const db = globalForPrisma.prisma ?? makeClient();
globalForPrisma.prisma = db;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

if (DEMO_MODE && isFreshClient) {
  globalForPrisma.prismaReady = (async () => {
    const { seedDemoDatabase } = await import("./demo-seed");
    await seedDemoDatabase(db);
  })();
}

if (globalForPrisma.prismaReady) {
  await globalForPrisma.prismaReady;
}
