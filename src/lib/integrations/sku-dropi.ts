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

  const [catalogo, productos, enlaces] = await Promise.all([
    fetchProductCatalog(tienda.shopDomain, tienda.accessToken),
    db.product.findMany({
      where: { organizationId },
      select: { id: true, name: true, shopifyProductId: true, shopifyProductTitle: true, sku: true },
    }),
    // Los nombres con los que ese producto aparece en la tienda. Hacen falta:
    // los dos vocabularios NO coinciden —en la pauta es "TE GINSENG" y en
    // Shopify "Te Ginseng para los Riñones"— y cruzar solo por el nombre
    // propio encontraba 5 de 116. Estos enlaces ya los hizo una persona en
    // Control › Enlazar pedidos, así que son la traducción buena.
    db.productoShopify.findMany({
      where: { organizationId },
      select: { productId: true, nombre: true },
    }),
  ]);

  const nombresDe = new Map<string, string[]>();
  for (const e of enlaces) {
    nombresDe.set(e.productId, [...(nombresDe.get(e.productId) ?? []), e.nombre]);
  }

  const porId = new Map(catalogo.map((c) => [c.id, c]));
  const porTitulo = new Map(catalogo.map((c) => [normalizar(c.title), c]));

  let actualizados = 0;
  let sinSku = 0;

  for (const p of productos) {
    // De lo más explícito a lo más suelto: el vínculo que alguien ancló a
    // mano, el título de la tienda guardado en la ficha, el nombre propio, y
    // por último los nombres con los que se lo enlazó en los pedidos.
    const porEnlace = (nombresDe.get(p.id) ?? [])
      .map((n) => porTitulo.get(normalizar(n)))
      .find((x) => x?.sku);

    const enCatalogo =
      (p.shopifyProductId ? porId.get(p.shopifyProductId) : undefined) ??
      (p.shopifyProductTitle ? porTitulo.get(normalizar(p.shopifyProductTitle)) : undefined) ??
      porTitulo.get(normalizar(p.name)) ??
      porEnlace;

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
