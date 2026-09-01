-- ============================================================================
-- Importadora Bella / Jarvis — cambios de esquema para el módulo "Contenido"
-- Generado: 2026-09-01. Corresponde a prisma/schema.prisma tras ese commit.
--
-- CÓMO APLICARLO
--   1. Entrar a Supabase → proyecto "Jarvis" → SQL Editor.
--   2. Pegar este archivo completo y correr "Run".
--   3. Si algo falla a mitad de camino, correr de nuevo desde el principio es
--      seguro: todo usa IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
--
-- QUÉ HACE
--   Solo agrega: 5 tablas nuevas + columnas nuevas en Product, Requirement,
--   Ronda y Campaign, todas con default o nulas. No borra ni modifica ninguna
--   columna existente, no toca ninguna fila. Es seguro correrlo con la app en
--   producción funcionando — no hay tiempo de bloqueo (lock) relevante.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Columnas nuevas en tablas existentes
-- ---------------------------------------------------------------------------

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "shopifyProductId"    TEXT,
  ADD COLUMN IF NOT EXISTS "shopifyProductTitle" TEXT;

ALTER TABLE "Requirement"
  ADD COLUMN IF NOT EXISTS "fechaAgendada" TIMESTAMP(3);

ALTER TABLE "Ronda"
  ADD COLUMN IF NOT EXISTS "nomenclatura"   TEXT,
  ADD COLUMN IF NOT EXISTS "tamanoObjetivo" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "fechaEntrega"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estado"         TEXT NOT NULL DEFAULT 'PLANEADO';

ALTER TABLE "Campaign"
  ADD COLUMN IF NOT EXISTS "productManual" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "archivada"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "rondaId"       TEXT,
  ADD COLUMN IF NOT EXISTS "tipoCampana"   TEXT;

DO $$ BEGIN
  ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_rondaId_fkey"
    FOREIGN KEY ("rondaId") REFERENCES "Ronda"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Tablas nuevas
-- ---------------------------------------------------------------------------

-- Links de trackeo de un producto (landing, Funnelish, la propia ficha de
-- Shopify...). Un producto puede tener más de uno.
CREATE TABLE IF NOT EXISTS "ProductoLink" (
  "id"          TEXT NOT NULL,
  "productId"   TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "etiqueta"    TEXT,
  "esPrincipal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductoLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProductoLink_productId_idx" ON "ProductoLink"("productId");

DO $$ BEGIN
  ALTER TABLE "ProductoLink"
    ADD CONSTRAINT "ProductoLink_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Tablero de tareas diarias — reemplaza la base de Notion del mismo nombre.
CREATE TABLE IF NOT EXISTS "TareaDiaria" (
  "id"               TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,
  "fecha"            TIMESTAMP(3),
  "ownerId"          TEXT,
  "responsableTexto" TEXT,
  "productId"        TEXT,
  "productoTexto"    TEXT,
  "plataforma"       TEXT,
  "campanaTiktok"    BOOLEAN NOT NULL DEFAULT false,
  "campanaMeta"      BOOLEAN NOT NULL DEFAULT false,
  "numeroCreativos"  INTEGER NOT NULL DEFAULT 0,
  "estado"           TEXT NOT NULL DEFAULT 'PENDIENTE',
  "etiquetas"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notas"            TEXT,
  "loteId"           TEXT,
  "origen"           TEXT,
  "notionPageId"     TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TareaDiaria_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TareaDiaria_organizationId_notionPageId_key"
  ON "TareaDiaria"("organizationId", "notionPageId");
CREATE INDEX IF NOT EXISTS "TareaDiaria_organizationId_fecha_idx"
  ON "TareaDiaria"("organizationId", "fecha");
CREATE INDEX IF NOT EXISTS "TareaDiaria_organizationId_ownerId_idx"
  ON "TareaDiaria"("organizationId", "ownerId");

DO $$ BEGIN
  ALTER TABLE "TareaDiaria"
    ADD CONSTRAINT "TareaDiaria_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TareaDiaria"
    ADD CONSTRAINT "TareaDiaria_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TareaDiaria"
    ADD CONSTRAINT "TareaDiaria_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TareaDiaria"
    ADD CONSTRAINT "TareaDiaria_loteId_fkey"
    FOREIGN KEY ("loteId") REFERENCES "Ronda"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Campañas de "gestión de campañas" (Notion) que todavía no cruzan con una
-- Campaign sincronizada de Meta/TikTok.
CREATE TABLE IF NOT EXISTS "CampanaManual" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "nombre"         TEXT NOT NULL,
  "productId"      TEXT,
  "productoTexto"  TEXT,
  "plataforma"     TEXT,
  "activa"         BOOLEAN NOT NULL DEFAULT true,
  "notas"          TEXT,
  "origen"         TEXT,
  "notionPageId"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CampanaManual_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampanaManual_organizationId_notionPageId_key"
  ON "CampanaManual"("organizationId", "notionPageId");
CREATE INDEX IF NOT EXISTS "CampanaManual_organizationId_activa_idx"
  ON "CampanaManual"("organizationId", "activa");

DO $$ BEGIN
  ALTER TABLE "CampanaManual"
    ADD CONSTRAINT "CampanaManual_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "CampanaManual"
    ADD CONSTRAINT "CampanaManual_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Conexión al import único de Notion (una por organización).
CREATE TABLE IF NOT EXISTS "NotionConnection" (
  "id"                 TEXT NOT NULL,
  "organizationId"     TEXT NOT NULL,
  "token"              TEXT,
  "tareasDatabaseId"   TEXT,
  "campanasDatabaseId" TEXT,
  "connectedAt"        TIMESTAMP(3),
  "lastImportAt"       TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotionConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotionConnection_organizationId_key"
  ON "NotionConnection"("organizationId");

DO $$ BEGIN
  ALTER TABLE "NotionConnection"
    ADD CONSTRAINT "NotionConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Idempotencia del cierre de día (evita notificar dos veces el mismo día).
CREATE TABLE IF NOT EXISTS "CierreSeguimiento" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "fecha"          TIMESTAMP(3) NOT NULL,
  "resumen"        TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CierreSeguimiento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CierreSeguimiento_organizationId_fecha_key"
  ON "CierreSeguimiento"("organizationId", "fecha");

DO $$ BEGIN
  ALTER TABLE "CierreSeguimiento"
    ADD CONSTRAINT "CierreSeguimiento_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

-- ============================================================================
-- Verificación rápida después de correrlo (opcional, para confirmar):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema='public' AND table_name IN
--   ('TareaDiaria','CampanaManual','ProductoLink','NotionConnection','CierreSeguimiento');
--   -- debe devolver las 5 filas.
-- ============================================================================
