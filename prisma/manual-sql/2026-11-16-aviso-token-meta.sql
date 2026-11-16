-- Aviso a Fabricio y Emilia: Meta necesita el token directo (16-nov).
INSERT INTO "Notification" (id, "userId", message, link, type, read, "createdAt")
VALUES
  ('aviso_token_meta_16nov_fabricio', 'usr_5079da653f00c701c881',
   'Importante: Meta está entrando incompleto. La cuenta CP2 - Top Ventas no entrega datos desde el 10 de noviembre (unos $222 diarios que Jarvis no ve) y la conexión de Meta por Windsor está fallando, así que el CPA y la utilidad salen mejores de lo real. Para arreglarlo de forma definitiva: en Conexiones › Meta pegue el token del Business Manager (usuario del sistema con todas las cuentas publicitarias, permiso ads_read, vencimiento Nunca). Los 3 pasos están en la tarjeta.',
   '/dashboard/conexiones', 'alert_discrepancia', false, now()),
  ('aviso_token_meta_16nov_emilia', 'usr_c402a8d1fc0b8cf8f185',
   'Ojo con los números de Meta: CP2 - Top Ventas no entrega datos desde el 10 de noviembre y Meta por Windsor está fallando, así que el CPA sale más bajo de lo real hasta que Fabricio pegue el token de Meta en Conexiones › Meta.',
   '/dashboard/conexiones', 'alert_discrepancia', false, now())
ON CONFLICT (id) DO NOTHING;
