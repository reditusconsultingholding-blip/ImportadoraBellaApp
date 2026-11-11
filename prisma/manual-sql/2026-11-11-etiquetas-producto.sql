-- Etiquetas de producto (pedido de Fabrizio y Emilia, llamada del 10-nov). Idempotente.
--
-- Por qué: el equipo necesita marcar cada producto como testeo, activo,
-- apagado, permanente, a reimportar o no, u orgánico, y verlo en las pantallas
-- de riesgo y de Shopify contra plataformas. Es una columna nueva con valor
-- por defecto: el código anterior la ignora, así que se puede aplicar antes
-- del despliegue sin romper nada.
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "etiquetas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
