# Importadora Bella (Jarvis)

Panel en vivo de campañas de Meta (Facebook + Instagram) y TikTok, ventas de
Shopify, pipeline creativo y operación para Importadora Bella (Fabrizio
Aguilar Muñoz). Jarvis es el nombre del asistente de IA integrado — responde
preguntas sobre el rendimiento y puede proponer acciones (pausar, reanudar,
ajustar presupuesto) que siempre quedan pendientes de aprobación humana antes
de tocar una cuenta real.

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
- Conexiones con menú lateral: cuentas de Meta/TikTok ilimitadas ("+ Agregar
  otra cuenta") y la tienda de **Shopify** por separado — cada red y la
  tienda son secciones plegables, para que la lista no crezca sin control.
- Shopify alimenta la vista "Ventas" con datos reales de la Admin API en
  cuanto se conecta (ventas, canal, AOV, top de productos). Sesiones y tasa
  de conversión reales no están disponibles por esa vía — hace falta la
  Shopify Analytics API (ShopifyQL), que pide permisos aparte.
- **Pipeline creativo** (SuperAds Ops), integrado dentro de Jarvis, para el
  equipo de producción de Reditus: roles OWNER / DIRECTOR / EDITOR / PENDING
  (un usuario nuevo arranca sin acceso hasta que le asignen rol desde
  Usuarios), tablero Kanban + vista de tabla con los desplegables de tipo de
  anuncio / fase / formato / ángulo / awareness / mercado, drawer de detalle
  con métricas editables y chat interno con `@menciones` que generan
  notificaciones (campanita en el header). Un Editor solo ve y edita lo que
  tiene asignado; Director/Owner ven y arman todo el pipeline.
- **Pipeline por producto** (`/dashboard/productos`): drill-down de cada
  producto con lo realizado / por realizar y qué anuncios testeados dieron
  buen o mal CPA.
- **Centro de notificaciones** (`/dashboard/notificaciones`): además de
  menciones, un motor de alertas (`src/lib/alerts.ts`) detecta oportunidades
  de escalar (CPA muy por debajo del objetivo), fatiga de anuncio (CTR/CPA
  que se deterioran entre snapshots) y discrepancias entre lo que reportan
  Meta/TikTok y las órdenes reales de Shopify. Corre solo en cada sync y
  también a demanda ("Revisar alertas ahora").
- **Reportes diarios en PDF** (`/dashboard/reportes`): un cron a medianoche
  (hora Ecuador) genera un PDF con ventas, campañas y alertas del día, y le
  notifica a cada OWNER. También se puede generar a mano.
- **Desempeño del equipo** (`/dashboard/desempeno`): ranking mensual de
  editores con podio top 3 y recompensas ($100 / $50 / $30).
- **Rentabilidad por producto** (`/dashboard/rentabilidad`): tabla mensual
  con los acumulados reales que ya llevaba Fabrizio en su planilla; las
  columnas "por pedido" se calculan solas.
- **Calculadora de precios** (`/dashboard/calculadora`) para dropshipping
  Ecuador: precio sugerido a partir de costos, comisión de pasarela, IVA y
  margen/ganancia objetivo. Incluye **tasa de confirmación y de devolución**
  (portadas del sistema en producción): el precio se ajusta por las ventas
  que de verdad se cobran, y abajo se ve el CPA breakeven, el CPA ideal, el
  costo real por venta (eCPA), el ROAS y cuatro escenarios comparativos.
  Si la tienda de Shopify está conectada, precio y costo unitario de cada
  producto se cargan del catálogo en vivo.
- **Torre logística Ecuador** (`/dashboard/logistica`), pensada para
  conectarse a Dropi: efectividad de entrega por provincia y transportadora.
  Sin una key de Dropi conectada todavía, muestra datos de ejemplo con la
  misma estructura que va a tener con datos reales (ver "Accesos pendientes").
- **Chequeo de salud** (`GET /api/health`): responde 200 si la app y la base
  contestan, 503 si la base falla. Es público a propósito, para que un monitor
  externo (UptimeRobot, Better Stack, el health check de Railway) lo consulte
  sin iniciar sesión.
- Tipografía **Poppins** en toda la app; el nombre visible es **Importadora
  Bella** (Jarvis queda como el asistente de IA, no como la marca). Los
  colores de marca están pendientes de que Fabrizio los envíe.

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

Abrir http://localhost:3000 (o el puerto que uses) e iniciar sesión con cualquiera
de estos tres, para ver el panel según cada rol:

```
importadorabellaav@gmail.com       / Jarvis2026!   (OWNER — Fabrizio)
reditusconsultingholding@gmail.com / Jarvis2026!   (DIRECTOR — Sebastian)
editor.demo@reditusconsulting.com  / Jarvis2026!   (EDITOR — Valentina, demo)
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
| `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET` | App "Jarvin Panal" del Dev Dashboard. Con esto el token de Shopify se pide y se renueva solo cada ~24h; si no, se pega un token fijo desde Conexiones. |
| `SHOPIFY_API_VERSION` | Versión de la Admin API. Por defecto `2025-04`. |
| `USER_CREATION_CODE` | Código que hay que tipear al crear un usuario. Por defecto `190300`. |

## Accesos pendientes para ir a producción

1. Que Fabrizio agregue a Reditus como partner en su **Business Manager** de Meta (permisos Ads Management + Insights), con los IDs de cada cuenta publicitaria.
2. Confirmar que **todas** las cuentas de Meta y TikTok tienen verificación en dos pasos.
3. Acceso como usuario autorizado en el **TikTok Business Center** de Fabrizio (o advertiser ID + autorización OAuth). Esto pasa por revisión de TikTok — conviene iniciarlo cuanto antes.
4. Decidir hosting (Vercel/otro) y, si aplica, dominio propio.
5. `ANTHROPIC_API_KEY` para que el chat de Jarvis funcione con datos reales.
6. Confirmar el patrón real de los códigos de producto en los nombres de campaña de Fabrizio (el seed usa `BAT-001`, `TAB-001`, `FAJ-001`, `BOD-001`, `CEP-001` como ejemplo).
7. Umbral de CPA "bueno/malo" por producto, para calibrar el semáforo con números reales.
8. **Colores e identidad gráfica de Importadora Bella** — Fabrizio los va a enviar; hoy la app usa la paleta ámbar/bronce original mientras tanto.
9. `CRON_SECRET` para proteger `/api/cron/sync` y `/api/cron/daily-report` en producción.

**Nota — Dropi / Torre logística: EN ESPERA, no es parte del alcance
actual.** La pantalla ya existe con datos de ejemplo, pero la integración
con Dropi queda pausada a propósito (decisión explícita, no un olvido) —
no pedir la key ni avanzarla todavía, y no presentarla como algo próximo.
Se retoma más adelante, cuando se indique. Ver `docs/DECISIONES.md`.

## Estructura

```
src/lib/db.ts                 cliente Prisma (SQLite vía adapter)
src/lib/auth.ts                sesión (JWT en cookie httpOnly)
src/lib/metrics.ts             agregación de métricas por producto/plataforma
src/lib/agent.ts               lógica del chat de Jarvis (Claude + tool use)
src/lib/alerts.ts               motor de alertas (escala / fatiga / discrepancia)
src/lib/daily-report.ts         genera el PDF del reporte diario (pdfkit)
src/lib/profitability.ts        cálculo de la tabla de rentabilidad
src/lib/logistics.ts            efectividad de envíos por provincia/transportadora
src/lib/performance.ts          puntaje de desempeño de editores
src/lib/integrations/          clientes reales de Meta Graph API y TikTok Business API
src/app/dashboard/              panel general + vista por producto
src/app/dashboard/jarvis/       chat con Jarvis
src/app/dashboard/pipeline/     Kanban/tabla del pipeline creativo
src/app/dashboard/productos/    pipeline específico por producto
src/app/dashboard/rentabilidad/ tabla de rentabilidad mensual
src/app/dashboard/calculadora/  calculadora de precios dropshipping Ecuador
src/app/dashboard/reportes/     historial de reportes diarios en PDF
src/app/dashboard/logistica/    torre logística Ecuador (Dropi)
src/app/dashboard/desempeno/    ranking de desempeño del equipo
prisma/schema.prisma            modelo de datos multi-tenant
prisma/seed.ts                  datos de ejemplo (productos reales de Fabrizio)
```

Nunca se ejecuta una acción de campaña sin aprobación explícita: toda
propuesta de Jarvis se guarda como `PendingAction` y solo se dispara
contra Meta/TikTok cuando alguien la aprueba desde el panel.
