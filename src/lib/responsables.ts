import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";

// Quién puede ver y tocar las piezas de cada producto.
//
// Dirección ve y edita todo. Un editor, dos cosas: las piezas que tiene
// asignadas a su nombre, y todas las de los productos que tiene a cargo. Las de
// otros productos no las ve: Emilia lo pidió así —"si Daniel quiere meterse a
// Truly no va a poder, porque no es el responsable"—, y tiene sentido más allá
// de la privacidad: si cualquiera escribe en cualquier producto, cuando falta
// algo no hay a quién preguntarle.

/** Los productos de los que una persona es responsable. */
export async function productosACargo(userId: string): Promise<string[]> {
  const filas = await db.responsableProducto.findMany({
    where: { userId },
    select: { productId: true },
  });
  return filas.map((f) => f.productId);
}

/** El filtro de Prisma con las piezas que una persona puede ver. */
export async function piezasVisibles(session: SessionPayload) {
  if (canManagePipeline(session.role)) return {};
  const aCargo = await productosACargo(session.userId);
  return {
    OR: [{ ownerId: session.userId }, ...(aCargo.length ? [{ productId: { in: aCargo } }] : [])],
  };
}

/** Si una persona puede abrir y editar una pieza concreta. */
export async function puedeTocarPieza(
  session: SessionPayload,
  pieza: { ownerId: string | null; productId: string | null },
): Promise<boolean> {
  if (canManagePipeline(session.role)) return true;
  if (pieza.ownerId === session.userId) return true;
  if (!pieza.productId) return false;
  const r = await db.responsableProducto.findUnique({
    where: { productId_userId: { productId: pieza.productId, userId: session.userId } },
    select: { userId: true },
  });
  return Boolean(r);
}

/**
 * Marca cada pieza con SI QUIEN PIDE LA PUEDE EDITAR.
 *
 * Esto existe porque el permiso se calculaba dos veces: el servidor decidía
 * quién podía guardar, y la pantalla volvía a deducir por su cuenta quién
 * podía escribir. Dos reglas que dicen lo mismo con código distinto no siguen
 * diciendo lo mismo mucho tiempo, y cuando se separan lo hacen en silencio y
 * para el lado que no se nota: la persona ve todo en gris, no puede trabajar,
 * y no hay ningún error en ninguna pantalla que lo explique.
 *
 * Ya pasó una vez —la pantalla preguntaba "¿sos responsable del producto?" y
 * el servidor aceptaba además al dueño de la pieza— y volvió a reportarse
 * después de arreglarlo. Así que deja de haber dos reglas: el servidor manda
 * el permiso ya resuelto, con la MISMA cuenta que después usa para autorizar
 * el guardado, y la pantalla solo lo obedece.
 *
 * Se resuelve en bloque, no pieza por pieza: son 6.000 filas y una consulta
 * por cada una haría inusable la pantalla.
 */
export async function conPermisoDeEdicion<T extends { ownerId: string | null; productId: string | null }>(
  session: SessionPayload,
  piezas: T[],
): Promise<(T & { puedeEditar: boolean })[]> {
  if (canManagePipeline(session.role)) {
    return piezas.map((p) => ({ ...p, puedeEditar: true }));
  }
  const aCargo = new Set(await productosACargo(session.userId));
  return piezas.map((p) => ({ ...p, puedeEditar: decidePermiso(session.userId, aCargo, p) }));
}

/**
 * LA REGLA, sin base de datos de por medio, para poder probarla.
 *
 * Dos caminos, no uno. Se escribe acá una sola vez porque la versión que
 * vivía en la pantalla se separó de la del servidor y el equipo se quedó una
 * semana sin poder cargar su trabajo.
 */
export function decidePermiso(
  userId: string,
  productosACargoDeEsaPersona: Set<string>,
  pieza: { ownerId: string | null; productId: string | null },
) {
  // 1. La pieza está a su nombre. Alcanza: cubrir un producto un día suelto
  //    es normal y no debería exigir que la sumen como responsable.
  if (pieza.ownerId === userId) return true;
  // 2. O lleva ese producto, y entonces puede con todas sus piezas.
  return pieza.productId != null && productosACargoDeEsaPersona.has(pieza.productId);
}

/** Si una persona puede crear piezas en un producto. */
export async function puedeCrearEn(session: SessionPayload, productId: string | null) {
  if (canManagePipeline(session.role)) return true;
  if (!productId) return false;
  return puedeTocarPieza(session, { ownerId: null, productId });
}

/**
 * El formato visual no se repite dentro de un mismo adset.
 *
 * Es la primera regla de diversidad del archivo de Super Ads: si dos piezas
 * del mismo adset comparten formato, compiten entre ellas y el adset entero
 * mide una sola cosa. El adset es la ronda de la pieza; si todavía no tiene
 * ronda, se toma el producto y el día —las cinco piezas que una persona sube
 * hoy para Truly son, en la práctica, el mismo adset—.
 *
 * Devuelve la pieza con la que choca, o null.
 */
export async function formatoRepetido(
  organizationId: string,
  pieza: {
    id?: string;
    productId: string | null;
    ronda: string | null;
    date: Date;
    visualFormat: string;
  },
) {
  if (!pieza.productId || !pieza.visualFormat.trim()) return null;
  // `date` es un instante (se crea con now()), así que "el mismo día" es el
  // día de Ecuador: de su medianoche a la siguiente, en hora UTC.
  const local = new Date(pieza.date.getTime() - 5 * 3600_000);
  const inicio = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 5));
  const fin = new Date(inicio.getTime() + 86400_000);
  return db.requirement.findFirst({
    where: {
      organizationId,
      productId: pieza.productId,
      visualFormat: pieza.visualFormat,
      ...(pieza.id ? { id: { not: pieza.id } } : {}),
      ...(pieza.ronda?.trim()
        ? { ronda: pieza.ronda.trim() }
        : { OR: [{ ronda: null }, { ronda: "" }], date: { gte: inicio, lt: fin } }),
    },
    select: { id: true, adName: true },
  });
}
