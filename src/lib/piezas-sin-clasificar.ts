import { db } from "@/lib/db";

// Las piezas que se cargaron sin decir qué ángulo ni qué formato son.
//
// POR QUÉ ES UNA ALERTA Y NO UN NÚMERO MÁS
// Todo el tablero de contenido existe para poder contestar una pregunta:
// "¿qué ángulo funciona?". Fabricio lo dijo así: "hemos testeado seis ángulos
// de venta y los que funcionan son dos; lo que buscamos es hacer más de los
// mismos y explorar nuevos". Esa respuesta se arma pieza por pieza, y una
// pieza sin ángulo no es un hueco en una tabla: es una prueba que se hizo, se
// pagó y no se puede contar.
//
// Por eso Emilia pidió que saque una alerta cuando el equipo no lo completa.
// Y por eso la alerta nombra las piezas y lleva a arreglarlas, en vez de decir
// "hay 14 sin clasificar": un contador no dice cuál.

/** Los campos que tiene que traer una pieza para poder compararse con otra. */
export const CAMPOS_DE_CLASIFICACION = [
  { campo: "adType", nombre: "tipo de anuncio" },
  { campo: "phase", nombre: "fase" },
  { campo: "visualFormat", nombre: "formato" },
  { campo: "angle", nombre: "ángulo" },
  { campo: "awarenessLevel", nombre: "nivel de consciencia" },
  { campo: "marketOrigin", nombre: "origen de mercado" },
] as const;

export type PiezaSinClasificar = {
  id: string;
  titulo: string;
  producto: string | null;
  responsable: string | null;
  responsableId: string | null;
  /** Qué le falta, con las palabras de la pantalla. */
  falta: string[];
  creadaEl: string;
};

/**
 * Las piezas sin clasificar del período.
 *
 * `soloDe` recorta a una persona: un editor tiene que ver LO SUYO, porque una
 * lista de catorce piezas de otros no se arregla sola y solo hace ruido.
 * Dirección las ve todas.
 */
export async function piezasSinClasificar(
  organizationId: string,
  desde: Date,
  hasta: Date,
  soloDe?: string,
): Promise<PiezaSinClasificar[]> {
  const filas = await db.requirement.findMany({
    where: {
      organizationId,
      // Sin el histórico importado: son piezas archivadas de otra operación y
      // pedirle al equipo que clasifique seis mil piezas viejas es pedirle que
      // ignore el aviso para siempre.
      origen: null,
      createdAt: { gte: desde, lte: hasta },
      ...(soloDe ? { ownerId: soloDe } : {}),
      // Los campos son texto no nulo: sin cargar quedan en cadena vacía, no
      // en null. Buscar por null no habría encontrado NINGUNA y el aviso
      // habría salido siempre en cero sin que nada fallara.
      OR: CAMPOS_DE_CLASIFICACION.map(({ campo }) => ({ [campo]: "" })),
    },
    select: {
      id: true,
      adName: true,
      createdAt: true,
      adType: true,
      phase: true,
      visualFormat: true,
      angle: true,
      awarenessLevel: true,
      marketOrigin: true,
      product: { select: { name: true } },
      owner: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return filas.map((r) => ({
    id: r.id,
    titulo: r.adName,
    producto: r.product?.name ?? null,
    responsable: r.owner?.name ?? null,
    responsableId: r.owner?.id ?? null,
    falta: CAMPOS_DE_CLASIFICACION.filter(
      ({ campo }) => !(r[campo as keyof typeof r] as string | null)?.trim(),
    ).map(({ nombre }) => nombre),
    creadaEl: r.createdAt.toISOString().slice(0, 10),
  }));
}
