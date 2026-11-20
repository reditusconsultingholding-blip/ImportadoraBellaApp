-- Buzón de propuestas, dudas y errores del equipo (burbuja de ayuda).
-- Idempotente. Ver model PropuestaEquipo en schema.prisma.
CREATE TABLE IF NOT EXISTS "PropuestaEquipo" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "texto" TEXT NOT NULL,
  "dictado" BOOLEAN NOT NULL DEFAULT false,
  "ruta" TEXT,
  "seccion" TEXT,
  "estado" TEXT NOT NULL DEFAULT 'NUEVA',
  "respuesta" TEXT,
  "respondidoPor" TEXT,
  "respondidoEn" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PropuestaEquipo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PropuestaEquipo_organizationId_estado_idx" ON "PropuestaEquipo"("organizationId", "estado");
CREATE INDEX IF NOT EXISTS "PropuestaEquipo_userId_idx" ON "PropuestaEquipo"("userId");
ALTER TABLE "PropuestaEquipo" ENABLE ROW LEVEL SECURITY;
