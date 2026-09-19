-- ============================================================================
-- Seguimiento de actividad (aplicado en producción el 2026-09-19).
-- Idempotente. La tabla nace con RLS por el trigger rls_en_tablas_nuevas.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "ActividadUsuario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "momento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "detalle" TEXT,
    "ip" TEXT,
    "navegador" TEXT,
    CONSTRAINT "ActividadUsuario_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ActividadUsuario_organizationId_userId_momento_idx" ON "ActividadUsuario"("organizationId", "userId", "momento");
CREATE INDEX IF NOT EXISTS "ActividadUsuario_momento_idx" ON "ActividadUsuario"("momento");
-- (FKs a Organization y User con ON DELETE CASCADE; ver schema.prisma)

-- El trigger de RLS automático, sin search_path mutable (aviso del linter).
ALTER FUNCTION public.rls_en_tablas_nuevas() SET search_path = '';
