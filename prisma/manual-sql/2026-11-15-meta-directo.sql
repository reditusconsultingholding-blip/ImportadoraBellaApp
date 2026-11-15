-- Meta Ads directo, sin Windsor (Fabrizio, 13-nov). Ver src/lib/integrations/meta-directo.ts.
CREATE TABLE IF NOT EXISTS "MetaConnection" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "token" TEXT,
  "cuentas" INTEGER NOT NULL DEFAULT 0,
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MetaConnection_organizationId_key" ON "MetaConnection"("organizationId");
DO $$ BEGIN
  ALTER TABLE "MetaConnection" ADD CONSTRAINT "MetaConnection_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
