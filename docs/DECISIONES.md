# Decisiones — Jarvis V2 (Importadora Bella)

Registro de decisiones tomadas el 2026-08-14 con Sebastian, para no
re-litigarlas al retomar el proyecto. Formato: decisión → por qué.

## Consolidación de sistemas
**Decisión:** `jarvis-dashboard` (Next.js, este repo) es la base — su diseño
visual y estructura de módulos predominan. Del sistema en producción
(`app-production-0d44.up.railway.app`, FastAPI/Postgres/Railway, app
Shopify "Jarvin Panal") se reusan solo las **conexiones ya probadas**
(patrón de auth de Shopify, fórmulas de rentabilidad con
confirmación/devolución).
**Por qué:** cita textual — "tomemos lo que es útil de lo que ya tiene y
complementémoslo con lo de nosotros pero con todo lo visual y estructurar de
nosotros para que predomine, estas conexiones son super valiosas para
cuando la integremos sea super rápido."

## Meta + TikTok vía Windsor.ai
**Decisión:** en vez de mantener integraciones directas separadas con Meta
Graph API y TikTok Business API, centralizar ambas a través de Windsor.ai.
**Por qué:** una sola integración en vez de dos, evita la espera de revisión
de TikTok Business Center (cuello de botella ya identificado), y habilita
un MCP server limpio encima de una sola fuente de datos ya normalizada.
Decisión delegada explícitamente a criterio técnico ("hazlo como lo veas
más viable con windsor ia").

## Código de autorización para crear usuarios
**Decisión:** la creación de usuarios sigue siendo manual (un Administrador
la hace desde Usuarios, no hay auto-registro público). Al presionar
"Crear" se exige un código de autorización: **`190300`**.
**Por qué:** "de lo contrario no les dejará crear la cuenta, para así el
que consiga el link no se pueda registrar sin el código" — es una segunda
barrera además de que ya es un admin quien crea la cuenta, pensada
originalmente para un flujo de auto-registro público que finalmente no se
va a implementar así, pero el código igual se mantiene como paso extra.

## Motor de recomendaciones
**Decisión:** tabla de recomendaciones visible solo para `OWNER` y
`DIRECTOR` (mapeado a "Directora creativa"). Cada una se puede aceptar (✓,
crea el `Requirement` real) o rechazar (✗). Botones de "Aceptar todas" /
"Negar todas". Las rechazadas van a una papelera y se borran solas a los
**15 días**.
**Por qué:** da control humano sobre las sugerencias automáticas sin
fricción (bulk actions) y sin perder una rechazada por error de un clic
(ventana de 15 días antes del borrado definitivo).

## Rol "Directora creativa"
**Decisión:** no se crea un rol nuevo — se mapea a `DIRECTOR`, que ya
representa "Directora Operativa Creativa" desde el diseño original del
pipeline (ver `prisma/schema.prisma`, comentario del enum `Role`).
**Por qué:** evita duplicar lógica de permisos; pendiente solo confirmar
el nombre de la persona real con Fabrizio.

## Tablero visual por producto — dos fases
**Decisión:** Fase 1 = tarjetas agrupadas por ángulo/concepto +
reordenables, con línea de tiempo diaria arriba. Fase 2 (después, no
bloqueante) = canvas 100% libre estilo Milanote con posición `x`/`y` por
tarjeta.
**Por qué:** la Fase 1 ya resuelve el problema real (30-40 pestañas de
Excel inmanejables) reusando el modelo de datos que ya existe
(`Requirement`/`RequirementVersion`/`RequirementActivity`); el canvas libre
es mucho más esfuerzo de UI (drag arbitrario, zoom/pan, z-index) y no debe
demorar el resto del sistema.

## Archivos — solo links por ahora
**Decisión:** no se construye upload de archivos reales todavía — se seguye
usando `thumbnailUrl` + links (Drive, TikTok, FB). Lo visual (tablero,
miniaturas) es lo que cambia, no el almacenamiento.
**Por qué:** pedido explícito del cliente ("por ahora solo links") — el
problema a resolver es la experiencia visual/de seguimiento diario, no
todavía la infraestructura de almacenamiento de archivos.

## Tablero visual — diseño final (no quedan opciones abiertas)
**Decisión:** encabezado con salud del producto (sparkline CPA 7 días +
badge de color) + línea de tiempo diaria + tablero agrupado por
ángulo/concepto con bordes de color por performance, construido en dos
entregas (agrupado primero, canvas libre estilo Milanote después).
**Por qué:** Fabrizio pidió explícitamente resolverlo "como yo quiera que
sea más conveniente" y que el resultado sea "una app espectacular" — se
tomó la decisión de diseño completa en vez de dejar alternativas, ver
`JARVIS_MASTER_REQUIREMENT_V2.md` sección 5.5.

## Mensajería — email primero, WhatsApp después
**Decisión:** el "anuncio general al ingresar" se construye adentro de la
app (modelo `Announcement`, sin costo ni proveedor externo). Los reportes
y alertas que necesitan llegar fuera de la app se mandan por **email**
(Resend) como primera fase. WhatsApp queda como fase aparte, condicionada a
resolver primero qué número se usa (riesgo de coexistencia ya documentado
en el CRM interno de Reditus).
**Por qué:** email no tiene fricción de aprobación ni riesgo de romper un
número de WhatsApp que ya esté en uso — resuelve el pedido real ("que le
llegue a Fabrizio y a todos los empleados") mucho más rápido que empezar
por WhatsApp.

## Dropi / Torre logística — en espera, fuera de alcance por ahora
**Decisión:** no se trabaja en la integración de Dropi en esta fase. La
pantalla de Torre logística queda como está (con datos de ejemplo), pero no
se pide la key, no se avanza la conexión, y no se le menciona a Fabrizio
como algo próximo.
**Por qué:** instrucción explícita de Sebastian — "aún no en este proyecto
haremos nada con Dropi... colocalo como en espera próximamente para no
generarle falsa expectativa al cliente." Se sacó de la arquitectura activa
(sección 3) y del plan de integración; queda documentado como función
futura, no como pendiente en curso.

## Ideas de referencia externa — qué se adopta y qué no
**Decisión:** del pipeline de video de una agencia externa (herramienta
ajena, acceso legítimo del usuario, solo se miró la estructura de
producto — no se guardó ningún dato de sus clientes) se adoptan: barra de
etapas horizontal en el drawer, generador de hooks/guion con IA por pieza,
biblioteca central de lo generado, y un filtro "Necesita atención" que
cruce todas las columnas. No se adopta: link mágico externo por tarea (no
aplica, el equipo son 7 editores con cuenta propia) ni el sidebar
seccionado por categorías (el actual todavía alcanza).
**Por qué:** son mejoras de UX/producto que no chocan con nada ya
decidido — se agregan al final del plan de integración (sección 6, punto
12) para no competir por prioridad con lo ya comprometido.

## Pendiente de confirmar (no decidido aún)
- Acceso al repo completo del sistema en Railway (hoy solo hay extractos
  de referencia, ver `REFERENCIA_SISTEMA_RAILWAY.md`).
- Regla exacta que dispara una recomendación automática (arrancar simple:
  ej. caída/suba de CPA por encima de un umbral en N días).
- Si `USER_CREATION_CODE` debe poder cambiarse desde el panel más adelante
  o queda fijo.
