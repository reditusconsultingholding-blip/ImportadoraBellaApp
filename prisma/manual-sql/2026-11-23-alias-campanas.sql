-- Otros nombres de un producto en las campañas sin código (23-nov). Se puede
-- correr dos veces.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "aliasCampanas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
