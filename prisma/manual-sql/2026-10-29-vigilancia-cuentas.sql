-- La vigilancia de las cuentas publicitarias (aplicado en producción el 2026-10-29). Idempotente.
--
-- Por qué: la alarma de «cuenta callada» se calculaba entera en el momento, y
-- su regla pide que la cuenta haya gastado en los últimos diez días para
-- considerarla viva. Resultado: una cuenta caída dejaba de avisar al undécimo
-- día —no porque se hubiera arreglado, sino porque el calendario avanzó— y
-- volvía a ser invisible. Ahora la caída se anota, y solo la cierran los datos
-- que vuelven o una persona que declara que la cuenta está apagada a propósito.
ALTER TABLE "AdAccount"
  ADD COLUMN IF NOT EXISTS "calladaDesde" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "apagadaAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "apagadaPor" TEXT,
  ADD COLUMN IF NOT EXISTS "ventaFueraWebAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ventaFueraWebPor" TEXT;
