# Jarvis — Importadora Bella · Master Requirement V2

> Documento de traspaso para retomar este proyecto en una sesión nueva de Claude
> y conectarlo todo de una — arquitectura, módulos, decisiones y qué reusar del
> sistema que ya existe en producción. Complementa (no reemplaza) el código ya
> escrito en este repo (`jarvis-dashboard`, Next.js) — ver `README.md` para el
> estado módulo por módulo actual.

## 1. Contexto del negocio

Importadora Bella (Fabrizio Aguilar Muñoz) es una importadora/dropshipping en
Ecuador — vende ~40 productos de belleza/salud vía Meta Ads + TikTok Ads,
tienda Shopify (`bellacorp.store`). Tiene **7 editores de video/imagen**
produciendo creativos todo el día. Hoy el seguimiento operativo vive en una
planilla de Excel con **30-40 pestañas** (una por producto o por corte) —
imposible de mantener a este volumen. El objetivo de Jarvis es reemplazar esa
planilla y centralizar ventas + pauta + producción creativa en un solo panel.

## 2. Punto de partida: hay DOS sistemas, hay que consolidar en uno

**Sistema A — `jarvis-dashboard` (este repo).** Next.js 16 + Prisma/SQLite,
construido en esta sesión. Tiene TODO el diseño visual, la estructura de
datos del pipeline creativo, rentabilidad, calculadora, alertas, reportes,
desempeño, torre logística — pero corre en modo demo (sin credenciales
reales conectadas todavía).

**Sistema B — sistema en producción real** (`app-production-0d44.up.railway.app`,
nombre de la app de Shopify: **"Jarvin Panal"**). FastAPI + PostgreSQL en
Railway. Tiene conexiones REALES ya funcionando: Shopify con catálogo y
costos en vivo, login con roles (JWT), y una calculadora de rentabilidad con
fórmulas más completas (tasa de confirmación, tasa de devolución — ver
`docs/REFERENCIA_SISTEMA_RAILWAY.md`).

**Decisión (confirmada por Sebastian):** la estructura visual y de módulos
de jarvis-dashboard (Sistema A) predomina — es lo que el usuario va a ver y
usar. Del Sistema B se reusan **las conexiones ya probadas** (patrón de auth
de Shopify, fórmulas de rentabilidad con confirmación/devolución) porque
"son super valiosas para que la integración sea rápida" — no hay que
redescubrir cómo autenticarse contra Shopify ni re-derivar las fórmulas de
breakeven, ya están resueltas y en producción.

**Acción para la sesión que retome esto:** confirmar con Sebastian si hay
acceso al repo completo del Sistema B (hoy solo hay extractos/referencia, no
el código fuente completo) antes de portar más piezas.

## 3. Arquitectura objetivo

```
Meta Ads ──┐
           ├──► Windsor.ai (centraliza y normaliza) ──► Jarvis backend ──► Postgres
TikTok Ads ┘         (una sola integración en vez de                         │
                       mantener 2 APIs + revisión de TikTok)                 │
                                                                              ▼
Shopify ───────────────────────────────────────────────► Jarvis backend ──► MCP server
   (patrón de auth: ver REFERENCIA_SISTEMA_RAILWAY.md)                       │
                                                                              ▼
                                                                    Claude / Jarvis chat
                                                              (consulta datos vía tool calls,
                                                               no un resumen fijo en el prompt)
```

**Dropi queda fuera de esta arquitectura por ahora — ver aviso en la
sección 5.9.** No se integra en esta fase.

**Por qué Windsor.ai (decisión delegada a mi criterio, confirmada por Sebastian
como "hazlo como lo veas más viable"):** Windsor.ai ya resuelve el OAuth y la
normalización de Meta + TikTok en un solo lugar — evita mantener dos
integraciones separadas y, sobre todo, evita el tiempo de espera de revisión
de TikTok Business Center para acceso de API que ya era un cuello de botella
identificado. El backend de Jarvis sincroniza contra la API de Windsor.ai
(mismo patrón que el cron actual `/api/cron/sync`, solo que pegándole a un
único proveedor en vez de a Meta y TikTok por separado).

**MCP server (nuevo, no existe hoy):** en vez de que `src/lib/agent.ts` arme
un resumen de texto fijo para el prompt de Jarvis (como hace hoy), exponer un
servidor MCP con herramientas (`get_campaign_performance`,
`get_product_profitability`, `get_pending_recommendations`, etc.) para que
Jarvis —y cualquier otra sesión de Claude— pueda consultar el negocio en
vivo con tool calls. Esto es una extensión natural de lo que ya existe, no
un rediseño.

## 4. Roles y mapeo

| Rol en el código (`Role` enum) | Quién es en el negocio |
|---|---|
| `OWNER` | CEO — Fabrizio |
| `DIRECTOR` | **Directora creativa** (mapeo asumido — confirmar nombre/persona con Fabrizio) |
| `EDITOR` | Cada uno de los 7 editores de video/imagen |
| `PENDING` | Recién registrado, sin rol asignado |

No hace falta un rol nuevo — `DIRECTOR` ya representa "Directora Operativa
Creativa" desde el diseño original del pipeline.

## 5. Módulos — qué existe, qué es nuevo, qué cambia

### 5.1 Autenticación y creación de cuentas — **cambia**
- La creación de usuarios sigue siendo la de siempre (un Administrador la
  hace desde Usuarios) — **no se vuelve auto-registro**.
- Al presionar "Crear" se pide un **código de autorización**: `190300`.
  Sin el código correcto, no se crea la cuenta. Implementación sugerida:
  variable de entorno `USER_CREATION_CODE`, validada en
  `POST /api/users` antes de crear el registro; el formulario en
  `usuarios/users-manager.tsx` agrega un campo más.
- El onboarding visual (bienvenida, primeros pasos) puede inspirarse en el
  de Skania (`C:\Users\Usuario\Projects\skania`) pero con la marca de
  Importadora Bella (navy + verde, ya aplicada en este repo).

### 5.2 Dashboard — **existe**
Panel de ventas (Shopify) + campañas (Meta/TikTok). Pendiente: conectar a
Windsor.ai en vez de Meta/TikTok directo.

### 5.3 Rentabilidad y Calculadora de precios — **existe, se enriquece**
Ya construidos (`/dashboard/rentabilidad`, `/dashboard/calculadora`) con
fórmulas de margen simple. **Portar del Sistema B:**
- Tasa de confirmación y tasa de devolución como inputs (hoy no están).
- Fórmula de `eCPA` (costo real por venta cobrada, no por checkout).
- Los 4 escenarios comparativos (actual, +10pts confirmación, packs
  AOV+40%/costo+60%, CPA−20%) — ver fórmulas completas en
  `REFERENCIA_SISTEMA_RAILWAY.md`.
- El catálogo de costos puede seguir viniendo de Shopify en vivo
  (`unitCost` por variante) igual que en el Sistema B.

### 5.4 Pipeline creativo — **existe**, con Kanban/tabla, drag&drop, versiones,
fechas de entrega, bitácora, filtros. Base sólida — no se reconstruye.

### 5.5 Tablero visual por producto — **nuevo** (reemplaza las 30-40 pestañas)

Decisión de diseño ya tomada (Fabrizio pidió que se resuelva "como yo
quiera que sea más conveniente" y que "sea una app espectacular") —
esto es la especificación final, no opciones a elegir:

**La pantalla de un producto (`/dashboard/productos/[code]`) se rediseña
en tres capas, de arriba hacia abajo:**

1. **Encabezado con "salud del producto"** — no solo el nombre y CPA
   objetivo: una franja con el CPA de los últimos 7 días vs. el objetivo
   (mini-sparkline, mismo componente de gráfico que ya usa el Panel),
   badge grande de "Rentable / En el límite / Perdiendo" con color
   (verde/ámbar/rojo), y el conteo realizado/por-realizar/buen-mal
   performance que ya existe hoy — todo esto arriba del pliegue, para que
   con un vistazo se sepa si vale la pena seguir invirtiendo en contenido
   de ese producto antes de mirar el detalle.

2. **Línea de tiempo diaria** (scroll horizontal, como un calendario de
   commits de GitHub pero con tarjetas): una columna por día con las
   piezas creadas/testeadas ese día, del más reciente al más viejo —
   calca la estructura real de la planilla `SUPERADS V2` (una fila por
   fecha) pero de forma visual. Cada columna colapsa a un número si no se
   la está mirando, y se expande al pasar el mouse/tocar.

3. **Tablero agrupado por ángulo/concepto** (reemplaza el Kanban-por-estado
   como vista principal de esta pantalla — el Kanban-por-estado del
   pipeline general se mantiene intacto en `/dashboard/pipeline`, esto es
   una vista adicional, no un reemplazo de esa): columnas por
   ángulo/concepto en vez de por estado (`Dolor Hiperspecífico`,
   `Transformación Emocional`, `Antes/Después`, etc. — los valores reales
   que ya vienen del CSV `SUPERADS V2`). Cada tarjeta muestra miniatura,
   formato visual, estado con su color, y un borde de color según
   performance (verde si Testeado con buen CPA, rojo si Testeado con mal
   CPA, gris si todavía no tiene métricas) — así de un vistazo se ve qué
   ángulo está funcionando sin entrar a cada tarjeta. Drag & drop entre
   grupos reasigna el ángulo (reusa el mismo patrón de drag&drop que ya
   existe en el Kanban por estado).

**Construcción en dos entregas** (para no bloquear el resto por el canvas
libre, que es la parte más cara de construir bien):
- **Entrega 1 — "tablero agrupado".** Todo lo de arriba, con posición
  automática (grid/flex, no drag libre) dentro de cada grupo — ya
  resuelve el problema real (30-40 pestañas inmanejables) y se ve pulido
  desde el día uno: transiciones suaves al reordenar, bordes de color por
  performance, sparklines, la línea de tiempo diaria. Reusa el modelo de
  datos existente (`Requirement`, `RequirementVersion`,
  `RequirementActivity`) sin cambios de schema.
- **Entrega 2 — canvas libre estilo Milanote.** Arrastrar cualquier
  tarjeta a cualquier posición `x`/`y` del lienzo, zoom/pan, tarjetas de
  texto libre para anotar ideas sueltas junto a los anuncios. Esto sí
  necesita un campo `positionX`/`positionY` (o `boardMeta Json`) en
  `Requirement` y una librería de canvas (ej. `react-flow` o `konva`, ya
  probadas para este tipo de UI) — es la entrega que hace que la app se
  sienta "espectacular" de verdad, pero es puramente incremental sobre la
  Entrega 1, no hay que rehacer nada.

Por ahora **solo links** (Drive, TikTok, FB) como ya está — el campo
`thumbnailUrl` ya existente cubre la miniatura visual sin necesitar upload
de archivos real todavía. Subir archivos de verdad queda como mejora
futura, no bloqueante (ver también sección 5.10 sobre almacenamiento).

### 5.6 Motor de recomendaciones — **nuevo**
Tabla de recomendaciones (auto-generadas a partir de qué campañas/ángulos
vienen funcionando bien en Meta/TikTok), visible **solo para OWNER y
DIRECTOR**:

- Cada recomendación sugiere un requerimiento nuevo (producto, ángulo,
  formato, motivo — ej. "CPA de este ángulo bajó 20% esta semana, generar 2
  variantes más") con dos acciones: **✓ aceptar** (crea el `Requirement` de
  verdad y lo asigna) o **✗ rechazar**.
- Botones de acción masiva: **"Aceptar todas"** / **"Negar todas"**.
- Las rechazadas van a una **papelera** — se guardan 15 días (por si se
  rechazó por error) y después se eliminan solas (job de limpieza diario).

Modelo sugerido:
```prisma
model Recommendation {
  id             String   @id @default(cuid())
  organizationId String
  productId      String?
  suggestedAdType       String
  suggestedAngle        String
  suggestedFormat       String
  reason         String   // por qué se sugiere (motivo generado del análisis)
  status         String   @default("PENDING") // PENDING | ACCEPTED | REJECTED
  createdAt      DateTime @default(now())
  decidedAt      DateTime?
  purgeAt        DateTime? // decidedAt + 15 días si fue rechazada; el cron la borra al pasar esta fecha
}
```

### 5.7 Chat interno — **existe** (por requerimiento, con `@menciones` →
notificación), mismo patrón que el CRM interno de Reditus.

### 5.8 Reportes diarios, Desempeño, Notificaciones/alertas — **existen**, sin cambios de alcance.

### 5.8b Torre logística / Dropi — **EN ESPERA, no es parte de esta fase**

> ⚠️ **No trabajar en esto todavía.** La pantalla de Torre logística ya
> existe en el repo con datos de ejemplo (para mostrar cómo se va a ver
> algún día), pero **Dropi no se integra en esta fase** — no hay que pedir
> la key, no hay que avanzar la conexión, y sobre todo **no hay que
> mencionarlo como algo próximo frente a Fabrizio**. Es una función a
> futuro, no un pendiente activo — decisión explícita para no generar una
> expectativa que todavía no toca cumplir. Retomar solo cuando Sebastian
> lo indique de nuevo.

### 5.9 Conexiones — **cambia**
- Meta + TikTok: reemplazar la sección actual por una sola tarjeta
  "Windsor.ai" (una key en vez de cuatro).
- Shopify: reusar el patrón de auth del Sistema B (`SHOPIFY_CLIENT_ID` +
  `SHOPIFY_CLIENT_SECRET`, client credentials grant, cacheado ~24h) en vez
  del token fijo simple que hay hoy — más robusto y ya probado en producción.
- Dropi: **en espera, fuera de esta fase** (ver 5.8b) — no forma parte del
  plan de integración de la sección 6.

### 5.10 Mensajería — notificaciones externas y anuncio general — **nuevo**

Dos cosas distintas, no confundirlas:

**A) Anuncio general al ingresar (in-app, sin costo, construir primero).**
Un mensaje que el CEO o la Directora puede escribir desde un panel simple
("Anuncios") y que le aparece a **todo el que inicia sesión** hasta que lo
cierra o hasta la fecha de expiración que se le ponga — un banner arriba
del Panel, no un modal bloqueante. Modelo sugerido:
```prisma
model Announcement {
  id        String   @id @default(cuid())
  organizationId String
  message   String
  createdBy String
  activeUntil DateTime?
  createdAt DateTime @default(now())
}
```
Se resuelve completo dentro de este mismo repo, sin ningún servicio externo.

**B) Notificaciones y reportes fuera de la app (a Fabrizio y a los 7+
empleados, aunque no tengan la app abierta).** Acá sí hace falta un
proveedor externo — recomendación en orden de qué construir primero:

1. **Email (arrancar por acá).** El reporte diario en PDF que ya se genera
   (`src/lib/daily-report.ts`) se manda por correo además de quedar en el
   panel; las alertas críticas (fatiga de anuncio, discrepancia de datos)
   también. Proveedor sugerido: **Resend** (tiene SDK simple para
   Next.js, capa gratis generosa, no requiere aprobación de nadie —
   arranca en minutos). Alternativas equivalentes: SendGrid, Postmark.
2. **WhatsApp (si de verdad hace falta que llegue ahí, no solo email).**
   Más caro y más lento de habilitar — necesita una cuenta de WhatsApp
   Business API vía un proveedor (Meta Cloud API directo, o Twilio /
   360dialog como intermediarios) y **una aprobación de plantillas de
   mensaje ante Meta**, que tarda días. **Aviso importante ya identificado
   en el CRM interno de Reditus:** mover un número de WhatsApp Business
   (la app normal del celular) a la Cloud API bloquea seguir usando la
   app del celular con ese mismo número, salvo que se use la función más
   nueva de "coexistencia" de Meta — hay que decidir esto con Fabrizio
   antes de elegir el número a usar, no después.
3. **Push notification / mensaje instantáneo dentro del navegador** (sin
   WhatsApp): una alternativa intermedia — más simple que WhatsApp, no
   necesita revisión de Meta, pero solo llega si el navegador está abierto
   o el dispositivo lo permite. Mencionarlo como opción B si WhatsApp se
   descarta por la fricción de aprobación/coexistencia.

**Recomendación concreta:** construir (A) y el envío por **email** de (B)
primero — resuelve el 90% del pedido ("que le llegue a Fabrizio y a todos
los empleados") sin fricción de aprobaciones externas. Dejar WhatsApp como
una fase aparte, después de decidir con Fabrizio el tema del número.

## 6. Plan de integración sugerido (orden)

1. Confirmar acceso al repo completo del Sistema B (o al menos más código
   además de estos extractos).
2. Portar el patrón de auth de Shopify (client credentials) al conector
   existente en `src/lib/integrations/shopify.ts`.
3. Enriquecer Rentabilidad/Calculadora con las fórmulas de
   confirmación/devolución del Sistema B.
4. Conectar Windsor.ai (nueva integración) — retirar los conectores directos
   de Meta/TikTok una vez Windsor.ai esté trayendo los mismos datos.
5. Código de autorización en creación de usuarios (cambio chico, hacerlo
   temprano).
6. Motor de recomendaciones + papelera 15 días.
7. Anuncio general al ingresar (`Announcement`) + envío de reportes/alertas
   por email (Resend) — resuelve la mensajería sin fricción externa.
8. Tablero visual Entrega 1 (agrupado, con sparklines y línea de tiempo
   diaria) sobre el pipeline existente.
9. MCP server sobre los datos ya centralizados, para Jarvis y para cualquier
   otra sesión de Claude.
10. Tablero visual Entrega 2 (canvas libre estilo Milanote) — al final, es
    la de más esfuerzo de UI y no bloquea nada del negocio.
11. WhatsApp (si se confirma con Fabrizio, después de resolver el tema del
    número — ver sección 5.10).

## 7. Preguntas abiertas para Fabrizio / Sebastian

- ¿Hay acceso al repositorio completo del Sistema B (Railway/FastAPI), o
  solo los extractos ya entregados?
- Confirmar quién es la "Directora creativa" (nombre) para dejarla creada
  con rol `DIRECTOR` desde el día uno.
- ¿El motor de recomendaciones se dispara con una regla simple (ej. "CPA
  bajó X% en N días") o hace falta algo más sofisticado (modelo/IA)? Se
  puede arrancar con reglas simples y evolucionar.
- ¿`USER_CREATION_CODE` fijo (`190300`) para siempre, o debería poder
  cambiarse desde el panel de Administrador más adelante?
- Si se quiere WhatsApp (no solo email): ¿qué número se usa? Definir esto
  antes de conectar nada — migrarlo a la Cloud API sin la función de
  "coexistencia" bloquea seguir usando la app normal de WhatsApp en ese
  número.

## 8. Recomendaciones para el negocio (no solo para el desarrollo)

- **No migrar el histórico del Excel** a mano — arrancar limpio desde la
  fecha de corte, igual que se hizo con el CRM interno de Reditus. Migrar
  30-40 pestañas manualmente cuesta más que el valor que aporta.
- **Empezar el tablero visual por los 5-10 productos con más gasto**, no
  por los 40 — valida el formato con el equipo antes de migrar todo.
- **El motor de recomendaciones debe explicar siempre el motivo** ("por
  qué" se sugiere) — una recomendación sin justificación no genera
  confianza y la Directora la va a rechazar por default.
- **La papelera de 15 días es la red de seguridad correcta** — evita
  perder una recomendación rechazada por error sin acumular basura
  indefinidamente.
- Con 7 editores, el ranking de desempeño (ya construido) es más valioso
  cuanto antes se muestre en vivo — considerarlo para la primera entrega,
  no para el final.
