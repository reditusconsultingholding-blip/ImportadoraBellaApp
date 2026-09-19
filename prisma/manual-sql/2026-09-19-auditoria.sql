-- ============================================================================
-- Importadora Bella / Jarvis — auditoría de seguridad y rendimiento
-- Aplicado en producción el 2026-09-19 (Supabase, proyecto pqlchgdwvjuyuknyexpe).
-- Corresponde a prisma/schema.prisma tras los commits de la auditoría.
--
-- Idempotente: se puede correr de nuevo sin efecto (IF [NOT] EXISTS).
-- Ninguna sentencia borra ni modifica filas.
-- ============================================================================

-- 1. Sesiones revocables: la versión viaja en la cookie; al cambiar la clave
--    se incrementa y las cookies anteriores dejan de valer.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- 2. Índices. El de ShopifyOrderLineItem(orderId) bajó el borrado del sync de
--    Shopify de ~408 ms a unos pocos ms (tabla de 134.000 filas sin índice).
DROP INDEX IF EXISTS "MetricSnapshot_campaignId_capturedAt_idx"; -- duplicaba al único
CREATE INDEX IF NOT EXISTS "MetricSnapshot_capturedAt_idx" ON "MetricSnapshot"("capturedAt");
CREATE INDEX IF NOT EXISTS "Campaign_productId_idx" ON "Campaign"("productId");
CREATE INDEX IF NOT EXISTS "CortePublicitario_productId_idx" ON "CortePublicitario"("productId");
CREATE INDEX IF NOT EXISTS "Requirement_productId_idx" ON "Requirement"("productId");
CREATE INDEX IF NOT EXISTS "Requirement_ownerId_idx" ON "Requirement"("ownerId");
CREATE INDEX IF NOT EXISTS "ShopifyOrderLineItem_orderId_idx" ON "ShopifyOrderLineItem"("orderId");
CREATE INDEX IF NOT EXISTS "TareaDiaria_productId_idx" ON "TareaDiaria"("productId");

-- 3. RLS en las 7 tablas que estaban expuestas a la API REST de Supabase
--    (PostgREST) sin protección. Sin políticas = cerradas para anon/
--    authenticated. Jarvis se conecta como dueño de las tablas (postgres) y no
--    se ve afectado.
ALTER TABLE "ProductoShopify" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CortePublicitario" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VariableProducto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GastoAdmMes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NombreShopifyExcluido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CorteSinAsignar" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResponsableProducto" ENABLE ROW LEVEL SECURITY;

-- 4. Toda tabla nueva en public nace con RLS activo. Así no se repite lo del
--    punto 3 cuando se agregue un modelo.
CREATE OR REPLACE FUNCTION public.rls_en_tablas_nuevas()
RETURNS event_trigger LANGUAGE plpgsql AS $$
DECLARE obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type = 'table' AND schema_name = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', obj.object_identity);
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rls_en_tablas_nuevas() FROM PUBLIC, anon, authenticated;
DROP EVENT TRIGGER IF EXISTS rls_en_tablas_nuevas;
CREATE EVENT TRIGGER rls_en_tablas_nuevas ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_en_tablas_nuevas();
