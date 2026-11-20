-- Meses en que un producto estuvo en prueba (20-nov, cuadre con el tablero de
-- Emilia en septiembre y octubre). Se puede correr dos veces.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "testeoMeses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
