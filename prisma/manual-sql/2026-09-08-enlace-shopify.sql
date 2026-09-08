-- El puente producto <-> nombre de Shopify.
--
-- Hasta ahora la rentabilidad solo se podía calcular sobre las compras que la
-- pauta se atribuye, que en esta tienda son el 17% de las órdenes. Lo que
-- Shopify cobró de verdad estaba guardado —16.145 líneas de pedido en 30 días—
-- pero no había forma de saber a qué producto pertenecía cada línea: en la
-- pauta el producto se llama "TE GINSENG" y en la tienda "Te Ginseng para los
-- Rinones".
--
-- Idempotente: se puede correr dos veces sin romper nada.

BEGIN;

CREATE TABLE IF NOT EXISTS "ProductoShopify" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "productId"      TEXT NOT NULL,
  "nombre"         TEXT NOT NULL,
  "nombreNorm"     TEXT NOT NULL,
  "automatico"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductoShopify_pkey" PRIMARY KEY ("id")
);

-- Un nombre de Shopify cuelga de un solo producto. Sin esta restricción el
-- mismo pedido se contaría dos veces y la suma de las utilidades por producto
-- daría más que la facturación de la tienda.
CREATE UNIQUE INDEX IF NOT EXISTS "ProductoShopify_organizationId_nombreNorm_key"
  ON "ProductoShopify"("organizationId", "nombreNorm");

CREATE INDEX IF NOT EXISTS "ProductoShopify_productId_idx"
  ON "ProductoShopify"("productId");

DO $$ BEGIN
  ALTER TABLE "ProductoShopify"
    ADD CONSTRAINT "ProductoShopify_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ProductoShopify"
    ADD CONSTRAINT "ProductoShopify_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ============================================================================
-- Verificación:
--   SELECT count(*) FROM "ProductoShopify";   -- 0 recién creada
-- ============================================================================
