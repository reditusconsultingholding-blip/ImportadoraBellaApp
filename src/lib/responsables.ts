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
