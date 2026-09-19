-- Origen de cada venta (aplicado en producción el 2026-09-19). Idempotente.
ALTER TABLE "ShopifyOrder"
  ADD COLUMN IF NOT EXISTS "atribucionAl" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "landingPage" TEXT,
  ADD COLUMN IF NOT EXISTS "origenFuente" TEXT,
  ADD COLUMN IF NOT EXISTS "origenTipo" TEXT,
  ADD COLUMN IF NOT EXISTS "referrerUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT,
  ADD COLUMN IF NOT EXISTS "utmContent" TEXT,
  ADD COLUMN IF NOT EXISTS "utmMedium" TEXT,
  ADD COLUMN IF NOT EXISTS "utmSource" TEXT;
