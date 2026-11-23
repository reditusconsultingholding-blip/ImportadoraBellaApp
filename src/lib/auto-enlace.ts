import { db } from "@/lib/db";
import { normalizarNombre } from "@/lib/enlace-shopify";
import { clasificarNombres } from "@/lib/pedidos-reales";

// ENLACE AUTOMÁTICO DE LOS NOMBRES NUEVOS (Emilia, 23-nov: «estos aquí son
// productos nuevos… debe haber alguna manera para sincronizar, ya que nosotros
// vamos agregando productos»).
//
// Cada oferta nueva de una landing llega de Shopify con su propio título, y
// muchos traen el ID del producto al final: «Desodorante Truly Unicorn Fruit -
// Product Id: 133801». Mientras nadie lo enlazaba a mano, esos pedidos no
// sumaban a ningún producto y «Shopify vs Ads» los mostraba «sin Shopify».
//
// La regla es la misma que usaría una persona y no adivina:
//   1. Sin el sufijo «- Product Id: …», el nombre ya está enlazado: va ahí.
//   2. Si no, el número es el código (o un código anterior) de una ficha: va ahí.
// Lo que no cumple ninguna de las dos sigue en «Enlazar pedidos» para que lo
// decida alguien. El enlace se guarda (automatico: true), así todas las
// pantallas que cruzan nombres lo ven igual.

const SUFIJO = /\s*-\s*Product Id:\s*([A-Za-z0-9-]+).*$/i;

/** Una línea con varios productos («A - Product Id: 1, B - Product Id: 2») no se adivina. */
function esVarios(nombre: string): boolean {
  return (nombre.match(/Product Id:/gi) ?? []).length > 1;
}

/**
 * La ficha de un nombre con «- Product Id: N», o null si no hay una sola
 * respuesta segura. `porNombre` son los nombres ya resueltos (normalizados) y
 * `porCodigo`, los códigos de ficha (normalizados).
 */
export function fichaPorProductId(
  nombre: string,
  porNombre: ReadonlyMap<string, string>,
  porCodigo: ReadonlyMap<string, string>,
): string | null {
  if (esVarios(nombre)) return null;
  const m = SUFIJO.exec(nombre);
  if (!m) return null;
  const base = normalizarNombre(nombre.slice(0, m.index));
  if (base && porNombre.has(base)) return porNombre.get(base)!;
  return porCodigo.get(normalizarNombre(m[1])) ?? null;
}

/** Enlaza los nombres de Shopify que se pueden resolver solos. Devuelve cuántos. */
export async function autoEnlazarNombres(organizationId: string): Promise<{ nombre: string; productId: string }[]> {
  const [nombres, enlaces, productos] = await Promise.all([
    clasificarNombres(organizationId),
    db.productoShopify.findMany({ where: { organizationId }, select: { nombreNorm: true, productId: true } }),
    db.product.findMany({
      where: { organizationId, archived: false },
      select: { id: true, name: true, code: true, codigosAnteriores: true, etiquetas: true },
    }),
  ]);

  // Una ficha unida o apagada no recibe pedidos nuevos.
  const vivas = productos.filter((p) => !p.code.endsWith("-UNIDO") && !p.etiquetas.includes("APAGADO"));
  const porCodigo = new Map<string, string>();
  for (const p of vivas) {
    for (const c of p.codigosAnteriores) porCodigo.set(normalizarNombre(c), p.id);
  }
  for (const p of vivas) porCodigo.set(normalizarNombre(p.code), p.id);

  const porNombre = new Map<string, string>();
  for (const p of vivas) porNombre.set(normalizarNombre(p.name), p.id);
  for (const e of enlaces) porNombre.set(e.nombreNorm, e.productId);

  const nuevos: { nombre: string; productId: string }[] = [];
  for (const n of nombres) {
    if (n.clase !== "sin") continue;
    const productId = fichaPorProductId(n.nombre, porNombre, porCodigo);
    if (!productId) continue;
    const nombreNorm = normalizarNombre(n.nombre);
    // Puede haber entrado por otro camino mientras tanto.
    const r = await db.productoShopify.createMany({
      data: [{ organizationId, productId, nombre: n.nombre, nombreNorm, automatico: true }],
      skipDuplicates: true,
    });
    if (r.count > 0) nuevos.push({ nombre: n.nombre, productId });
  }
  return nuevos;
}
