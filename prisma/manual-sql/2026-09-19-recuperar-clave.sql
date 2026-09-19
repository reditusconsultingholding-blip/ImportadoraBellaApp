-- Recuperación de contraseña por correo (aplicado en producción el 2026-09-19). Idempotente.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "claveResetHash" TEXT, ADD COLUMN IF NOT EXISTS "claveResetVence" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "User_claveResetHash_key" ON "User"("claveResetHash");
