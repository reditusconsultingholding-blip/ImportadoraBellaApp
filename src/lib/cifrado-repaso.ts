import { db } from "@/lib/db";
import { descifrar, necesitaRecifrar } from "@/lib/cifrado";

// Cifra los tokens que todavía están en texto plano (los guardados antes de
// que existiera el cifrado) y pasa a la llave dedicada los que se cifraron con
// la de sesión, cuando ENCRYPTION_KEY aparece en el servidor.
//
// Lee con SQL crudo porque el cliente ya devuelve los valores descifrados: la
// única forma de ver lo que de verdad hay guardado es saltarse la extensión.
// Escribe con el cliente normal, que cifra con la llave vigente.
//
// Corre en cada vuelta del reloj. Son cuatro consultas chicas y, una vez que
// todo está cifrado, no escribe nada.

const TABLAS = [
  { tabla: "AdAccount", campo: "accessToken", modelo: "adAccount" },
  { tabla: "ShopifyStore", campo: "accessToken", modelo: "shopifyStore" },
  { tabla: "DropiConnection", campo: "integrationKey", modelo: "dropiConnection" },
  { tabla: "NotionConnection", campo: "token", modelo: "notionConnection" },
  { tabla: "Organization", campo: "resendApiKey", modelo: "organization" },
] as const;

export async function recifrarPendientes(): Promise<number> {
  let cambiados = 0;
  for (const { tabla, campo, modelo } of TABLAS) {
    // Nombres fijos de esta lista, nunca entrada del usuario.
    const filas = await db.$queryRawUnsafe<{ id: string; valor: string | null }[]>(
      `SELECT "id", "${campo}" AS valor FROM "${tabla}" WHERE "${campo}" IS NOT NULL`,
    );
    for (const f of filas) {
      if (!necesitaRecifrar(f.valor)) continue;
      const plano = descifrar(f.valor);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db[modelo] as any).update({ where: { id: f.id }, data: { [campo]: plano } });
      cambiados++;
    }
  }
  return cambiados;
}
