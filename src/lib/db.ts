import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cifrar, descifrar } from "@/lib/cifrado";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Los campos que guardan secretos de terceros. Se cifran al escribir y se
// descifran al leer acá, en un solo lugar: ningún código que usa estos tokens
// tiene que acordarse de hacerlo, y ninguno puede olvidarse. Ver cifrado.ts.
const SECRETOS = {
  adAccount: "accessToken",
  shopifyStore: "accessToken",
  dropiConnection: "integrationKey",
  notionConnection: "token",
} as const;

type ModeloConSecreto = keyof typeof SECRETOS;

/** Cifra el campo secreto dentro de un `data` de Prisma, si viene. */
function cifrarData(modelo: ModeloConSecreto, data: unknown) {
  if (!data || typeof data !== "object") return;
  if (Array.isArray(data)) {
    for (const d of data) cifrarData(modelo, d);
    return;
  }
  const campo = SECRETOS[modelo];
  const obj = data as Record<string, unknown>;
  const v = obj[campo];
  if (typeof v === "string") obj[campo] = cifrar(v);
  // `{ set: "..." }` también es una forma válida de escribir un campo.
  else if (v && typeof v === "object" && typeof (v as { set?: unknown }).set === "string") {
    (v as { set: string }).set = cifrar((v as { set: string }).set) as string;
  }
}

const ESCRITURAS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
]);

function escritura(modelo: ModeloConSecreto) {
  return {
    async $allOperations({ operation, args, query }: { operation: string; args: unknown; query: (a: unknown) => Promise<unknown> }) {
      const a = args as Record<string, unknown>;
      if (ESCRITURAS.has(operation)) cifrarData(modelo, a.data);
      else if (operation === "upsert") {
        cifrarData(modelo, a.create);
        cifrarData(modelo, a.update);
      }
      return query(args);
    },
  };
}

function conCifrado(base: PrismaClient): PrismaClient {
  return base.$extends({
    query: {
      adAccount: escritura("adAccount"),
      shopifyStore: escritura("shopifyStore"),
      dropiConnection: escritura("dropiConnection"),
      notionConnection: escritura("notionConnection"),
    },
    result: {
      adAccount: {
        accessToken: { needs: { accessToken: true }, compute: (r) => descifrar(r.accessToken) ?? null },
      },
      shopifyStore: {
        accessToken: { needs: { accessToken: true }, compute: (r) => descifrar(r.accessToken) ?? null },
      },
      dropiConnection: {
        integrationKey: { needs: { integrationKey: true }, compute: (r) => descifrar(r.integrationKey) ?? null },
      },
      notionConnection: {
        token: { needs: { token: true }, compute: (r) => descifrar(r.token) ?? null },
      },
    },
  }) as unknown as PrismaClient;
}

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

  globalForPrisma.prisma = conCifrado(new PrismaClient({ adapter: new PrismaPg({ connectionString }) }));
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
