-- Aviso a Emilia y a Fabricio: «Riesgo por producto» ya es su archivo.
-- Les aparece en la campana de notificaciones con enlace directo a la
-- pestaña, donde la guía «Qué hacer ahora» dice los pasos que faltan.
INSERT INTO "Notification" (id, "userId", message, link, type, read, "createdAt")
VALUES
  ('aviso_riesgo_16nov_emilia', 'usr_c402a8d1fc0b8cf8f185',
   'Ya está tu archivo de Confirmación y CPA dentro de Jarvis, en Control publicitario › Riesgo por producto, con tus mismas reglas (70 % / 57 %, CPA en rojo pasando de $6). Arriba te dejé los dos pasos que faltan: marcar los testeos y enlazar los nombres nuevos de la planilla. Hay un video de un minuto.',
   '/dashboard/control?vista=riesgo', 'asignacion', false, now()),
  ('aviso_riesgo_16nov_fabricio', 'usr_5079da653f00c701c881',
   'Riesgo por producto ya clasifica igual que el archivo de Emilia, y Shopify vs Ads es tu archivo de pedidos reales contra Meta y TikTok. El gasto que muestra Jarvis es el real de las plataformas: el archivo dejaba afuera lo gastado sin conversiones, por eso su CPA salía más bajo.',
   '/dashboard/control?vista=riesgo', 'asignacion', false, now())
ON CONFLICT (id) DO NOTHING;
