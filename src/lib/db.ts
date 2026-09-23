import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { cifrar, descifrar } from "@/lib/cifrado";
import { invalidarMemoria } from "@/lib/memoria";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Los campos que guardan secretos de terceros. Se cifran al escribir y se
// descifran al leer acá, en un solo lugar: ningún código que usa estos tokens
// tiene que acordarse de hacerlo, y ninguno puede olvidarse. Ver cifrado.ts.
const SECRETOS = {
  adAccount: "accessToken",
  shopifyStore: "accessToken",
  dropiConnection: "integrationKey",
  notionConnection: "token",
  organization: "resendApiKey",
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
      organization: escritura("organization"),
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
      organization: {
        resendApiKey: {
          needs: { resendApiKey: true },
          compute: (r) => descifrar(r.resendApiKey) ?? null,
        },
      },
    },
  }) as unknown as PrismaClient;
}

// Toda escritura tira la memoria de cálculos pesados (src/lib/memoria.ts), así
// una pantalla nunca muestra números anteriores al último sync o a la última
// edición. Quedan afuera los modelos que no mueven ningún número: chat,
// presencia de voz, notificaciones, estado de los syncs, el registro de
// actividad y el usuario (avatar, recorrido de capacitación).
const OPERACIONES_DE_ESCRITURA = new Set([
  ...ESCRITURAS,
  "upsert",
  "delete",
  "deleteMany",
]);
const SIN_EFECTO_EN_NUMEROS = new Set([
  "VoicePresence",
  "VoiceSignal",
  "ChatMessage",
  "ChatRead",
  "ChatReaction",
  "ChatPin",
  "Notification",
  "PushSubscription",
  "AnuncioVisto",
  "SyncState",
  "JarvisMensaje",
  "JarvisConversacion",
  "ActividadUsuario",
  "AdCreativo",
  "AdCreativoDia",
  "User",
]);

function conInvalidacion(c: PrismaClient): PrismaClient {
  return c.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const r = await query(args);
          if (OPERACIONES_DE_ESCRITURA.has(operation) && !SIN_EFECTO_EN_NUMEROS.has(model)) invalidarMemoria();
          return r;
        },
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

  // PERFIL_CONSULTAS=1 escribe cada consulta con su duración: sirve para ver
  // cuántos viajes a la base hace una pantalla y cuál es la lenta. Apagado
  // por defecto (en producción sería ruido y costo).
  const perfil = process.env.PERFIL_CONSULTAS === "1";
  // Cuántas conexiones abre cada instancia.
  //
  // El pooler de Supabase (plan gratuito, modo sesión) acepta 15 en total y el
  // valor por defecto de pg es 10 por proceso. En cada despliegue conviven un
  // rato la instancia vieja y la nueva: 20 conexiones, y las pantallas
  // fallaban con "max clients reached" hasta que la vieja se apagaba. Con 6
  // caben las dos y queda margen; las consultas de más esperan su turno unos
  // milisegundos en vez de fallar.
  const maxConexiones = Number(process.env.DB_POOL_MAX) || 6;
  const base = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: maxConexiones }),
    ...(perfil ? { log: [{ emit: "event" as const, level: "query" as const }] } : {}),
  });
  if (perfil) {
    (base as unknown as { $on: (e: "query", cb: (q: { duration: number; query: string }) => void) => void }).$on(
      "query",
      (q) => console.log(`[consulta] ${q.duration}ms ${q.query.replace(/\s+/g, " ").slice(0, 140)}`),
    );
  }
  globalForPrisma.prisma = conInvalidacion(conCifrado(base));
  return globalForPrisma.prisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    if (typeof value !== "function") return value;
    // El SQL crudo de escritura no pasa por las extensiones de modelo.
    if (prop === "$executeRaw" || prop === "$executeRawUnsafe") {
      return async (...args: unknown[]) => {
        const r = await (value as (...a: unknown[]) => Promise<unknown>).apply(client, args);
        // $executeRaw devuelve cuántas filas tocó: si fueron cero, nada
        // cambió y las pantallas calculadas siguen valiendo.
        if (typeof r !== "number" || r > 0) invalidarMemoria();
        return r;
      };
    }
    return value.bind(client);
  },
});
