import { db } from "@/lib/db";
import { fetchProductCatalog } from "@/lib/integrations/shopify";
import { normalizar } from "@/lib/product-code";

// El SKU de cada producto, que es su ID en Dropi.
//
// POR QUÉ IMPORTA UN CAMPO QUE PARECE DE INVENTARIO
// Es el número con el que Fabricio y Emilia piensan —"el 177118"— y el que
// Fabricio pone adelante en el nombre de sus campañas. Buscar por ese número
// tiene que funcionar, y el número tiene que verse al lado del nombre.
//
// Y tener SKU dice algo más: el producto está conectado a Dropi, o sea que se
// despacha de verdad. Los que no lo tienen son, casi siempre, catálogo viejo
// que nadie limpió — de ahí la sección "productos sin SKU", que es la lista de
// candidatos a depurar de la que hablaron en la reunión.
//
// El SKU vive en Shopify, en la variante, así que se trae del catálogo. Se
// cruza primero por el vínculo explícito (`shopifyProductId`) y, si no lo hay,
// por el nombre normalizado — que es el mismo par de reglas con el que ya se
// cruza el precio.

export type ResultadoSku = { revisados: number; actualizados: number; sinSku: number };

export async function sincronizarSkus(organizationId: string): Promise<ResultadoSku> {
  const tienda = await db.shopifyStore.findFirst({
    where: { organizationId, connectedAt: { not: null } },
  });
  if (!tienda) return { revisados: 0, actualizados: 0, sinSku: 0 };

  const [catalogo, productos] = await Promise.all([
    fetchProductCatalog(tienda.shopDomain, tienda.accessToken),
    db.product.findMany({
      where: { organizationId },
      select: { id: true, name: true, shopifyProductId: true, shopifyProductTitle: true, sku: true },
    }),
  ]);

  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const porTitulo = new Map(catalogo.map((c) => [normalizar(c.title), c]));

  let actualizados = 0;
  let sinSku = 0;

  for (const p of productos) {
    const enCatalogo =
      (p.shopifyProductId ? porId.get(p.shopifyProductId) : undefined) ??
      porTitulo.get(normalizar(p.shopifyProductTitle ?? p.name));

    const sku = enCatalogo?.sku ?? null;
    if (sku == null) {
      sinSku += 1;
      // Un producto que desapareció del catálogo —o que nunca estuvo— NO se
      // queda sin SKU: se deja el que tenía. Borrarlo por una consulta que
      // volvió corta lo mandaría a la lista de "para depurar" sin motivo.
      continue;
    }
    if (p.sku === sku) continue;

    await db.product.update({ where: { id: p.id }, data: { sku } });
    actualizados += 1;
  }

  return { revisados: productos.length, actualizados, sinSku };
}
