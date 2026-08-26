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
Shopify ───────────────────────────────────────────────► Jarvis backend     │
   (patrón de auth: ver REFERENCIA_SISTEMA_RAILWAY.md)                       │
                                                                              ▼
Dropi (pendiente key) ────────────────────────────────► Jarvis backend ──► MCP server
                                                                              │
                                                                              ▼
                                                                    Claude / Jarvis chat
                                                              (consulta datos vía tool calls,
                                                               no un resumen fijo en el prompt)
```

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
Sustituye la idea de "una fila por anuncio en una grilla plana" por una
vista de dos niveles dentro de cada producto:

1. **Línea de tiempo diaria** (arriba, scroll horizontal): una columna por
   día con las piezas creadas/testeadas ese día — calca la estructura real
   de la planilla (`SUPERADS V2`, una fila por fecha).
2. **Canvas agrupado por ángulo/concepto** (abajo, en vez de por estado):
   tarjetas con miniatura + ángulo + formato + estado, agrupadas
   visualmente por concepto — mismas fichas ya construidas (drawer con
   versiones/actividad/chat).

**Fase 1 (recomendada primero):** tarjetas agrupables y reordenables dentro
de cada grupo — ya es un salto enorme sobre Excel y reusa el modelo de datos
existente (`Requirement`, `RequirementVersion`, `RequirementActivity`).
**Fase 2 (después):** canvas 100% libre estilo Milanote, con posición
`x`/`y` guardada por tarjeta — mucho más trabajo de UI (drag libre,
z-index, zoom/pan), no bloquea el resto del sistema.

Por ahora **solo links** (Drive, TikTok, FB) como ya está — el campo
`thumbnailUrl` ya existente cubre la miniatura visual sin necesitar upload
de archivos real todavía. Subir archivos de verdad queda como mejora
futura, no bloqueante.

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

### 5.8 Torre logística, Reportes diarios, Desempeño, Notificaciones/alertas — **existen**, sin cambios de alcance.

### 5.9 Conexiones — **cambia**
- Meta + TikTok: reemplazar la sección actual por una sola tarjeta
  "Windsor.ai" (una key en vez de cuatro).
- Shopify: reusar el patrón de auth del Sistema B (`SHOPIFY_CLIENT_ID` +
  `SHOPIFY_CLIENT_SECRET`, client credentials grant, cacheado ~24h) en vez
  del token fijo simple que hay hoy — más robusto y ya probado en producción.
- Dropi: sin cambios, sigue pendiente de la key real.

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
7. Tablero visual Fase 1 (agrupado) sobre el pipeline existente.
8. MCP server sobre los datos ya centralizados, para Jarvis y para cualquier
   otra sesión de Claude.
9. Tablero visual Fase 2 (canvas libre) — al final, es la de más esfuerzo de
   UI y no bloquea nada del negocio.

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
