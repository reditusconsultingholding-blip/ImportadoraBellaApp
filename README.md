# Jarvis

Panel en vivo de campañas de Meta (Facebook + Instagram) y TikTok para
Fabrizio Aguilar Muñoz, con un asistente (Jarvis) que responde preguntas
sobre el rendimiento y puede proponer acciones — pausar, reanudar, ajustar
presupuesto — que siempre quedan pendientes de aprobación humana antes de
tocar una cuenta real.

Ver la propuesta completa (alcance, fases, precio): documento compartido
por separado con Reditus Consulting.

## Estado actual

Lo que ya funciona, con datos de prueba (seed):

- Login y sesión por Organization (arquitectura lista para más clientes, no solo Fabrizio).
- Panel general: gasto, CTR, compras totales, productos que necesitan revisión.
- Vista por producto con semáforo de CPA, separado por Meta / TikTok.
- Chat con Jarvis, con flujo de propuesta → aprobación → ejecución.
- Actualización en vivo: el panel se refresca solo cada 30 segundos (indicador
  "En vivo" con reloj en el header), y un cron (`vercel.json` + `/api/cron/sync`)
  sincroniza las cuentas conectadas cada 15 minutos sin que nadie tenga que
  entrar a Conexiones a apretar "Sincronizar ahora".

Lo que falta para pasar a producción: conectar credenciales reales
(ver "Accesos pendientes" abajo) — el código de integración ya está
escrito contra los endpoints reales de Meta y TikTok, solo falta el token.

## Correr en local

```bash
npm install
npx prisma migrate dev   # crea prisma/dev.db
npm run db:seed          # carga datos de ejemplo
npm run dev
```

Abrir http://localhost:3000 (o el puerto que uses) e iniciar sesión con:

```
importadorabellaav@gmail.com / Jarvis2026!
```

Esta clave es genérica a propósito: la primera vez que entra, la app obliga
a cambiarla antes de dejar pasar al panel.

## Variables de entorno

Copiar `.env.example` a `.env` y completar:

| Variable | Para qué sirve |
|---|---|
| `DATABASE_URL` | Ya viene lista para SQLite local. En producción, apuntar a Postgres. |
| `SESSION_SECRET` | Firma las cookies de sesión. Generar uno propio en producción. |
| `ANTHROPIC_API_KEY` | Sin esto, el chat de Jarvis responde con un aviso en vez de contestar. |
| `META_APP_ID` / `META_APP_SECRET` | App de Meta for Developers para la Marketing API. |
| `TIKTOK_APP_ID` / `TIKTOK_APP_SECRET` | App de TikTok for Business (requiere aprobación de TikTok). |

## Accesos pendientes para ir a producción

1. Que Fabrizio agregue a Reditus como partner en su **Business Manager** de Meta (permisos Ads Management + Insights), con los IDs de cada cuenta publicitaria.
2. Confirmar que **todas** las cuentas de Meta y TikTok tienen verificación en dos pasos.
3. Acceso como usuario autorizado en el **TikTok Business Center** de Fabrizio (o advertiser ID + autorización OAuth). Esto pasa por revisión de TikTok — conviene iniciarlo cuanto antes.
4. Decidir hosting (Vercel/otro) y, si aplica, dominio propio.
5. `ANTHROPIC_API_KEY` para que el chat de Jarvis funcione con datos reales.
6. Confirmar el patrón real de los códigos de producto en los nombres de campaña de Fabrizio (el seed usa `BAT-001`, `TAB-001`, `FAJ-001`, `BOD-001`, `CEP-001` como ejemplo).
7. Umbral de CPA "bueno/malo" por producto, para calibrar el semáforo con números reales.

## Estructura

```
src/lib/db.ts                 cliente Prisma (SQLite vía adapter)
src/lib/auth.ts                sesión (JWT en cookie httpOnly)
src/lib/metrics.ts             agregación de métricas por producto/plataforma
src/lib/agent.ts               lógica del chat de Jarvis (Claude + tool use)
src/lib/integrations/          clientes reales de Meta Graph API y TikTok Business API
src/app/dashboard/              panel general + vista por producto
src/app/dashboard/jarvis/       chat con Jarvis
prisma/schema.prisma            modelo de datos multi-tenant
prisma/seed.ts                  datos de ejemplo (productos reales de Fabrizio)
```

Nunca se ejecuta una acción de campaña sin aprobación explícita: toda
propuesta de Jarvis se guarda como `PendingAction` y solo se dispara
contra Meta/TikTok cuando alguien la aprueba desde el panel.
