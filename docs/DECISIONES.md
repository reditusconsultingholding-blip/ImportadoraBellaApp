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
**Decisión:** de una herramienta interna de una agencia externa (acceso
legítimo del usuario; se revisó a fondo pipeline, reportes, roster,
outreach y su documentación interna — no se guardó ni se reproduce ningún
dato de sus clientes ni de su equipo, solo la estructura de producto) se
adoptan ocho ideas, ver `JARVIS_MASTER_REQUIREMENT_V2.md` sección 5.11:
barra de etapas horizontal en el drawer, generador de hooks/guion con IA
por pieza + biblioteca central, resumen ejecutivo en lenguaje natural
generado por IA arriba del Panel, filtro "Necesita atención" transversal,
sparklines por fila en las tablas, un Playbook de ayuda dentro de la
app, y auto-creación de la primera pieza al dar de alta un producto.

No se adopta: el roster de videographers freelance con mapa geográfico y
el agente de outreach por Instagram (resuelven un problema — sourcing de
freelancers externos — que Importadora Bella no tiene, el equipo son 7
editores fijos), el link mágico externo por tarea (misma razón), ni el
sidebar seccionado por categorías (el plano actual todavía alcanza).
**Por qué:** son mejoras de UX/producto que no chocan con nada ya
decidido — se agregan al final del plan de integración (sección 6, punto
12) para no competir por prioridad con lo ya comprometido.

## Una sola calculadora (22 de septiembre de 2026)
**Decisión:** queda la **Calculadora de precios** y se retira "Costeo y
utilidad", cuya dirección redirige. De la retirada se trajo lo que servía:
catálogo de Shopify en vivo, deslizadores, veredicto en una frase,
confirmación de equilibrio, escenarios en barras y el desglose del día.
**Por qué:** eran dos entradas seguidas que se leían como lo mismo, y la
retirada no tenía botón de guardar ni avisaba cuando el servidor rechazaba
el guardado.

## Frescura de los datos de pauta (22 de septiembre de 2026)
**Decisión:** dos relojes (ventas y pauta cada 2 minutos; el resto cada 5),
escritura diferencial en Shopify y Windsor, y `refresh_interval` en cada
pedido a Windsor (15min → 1h → sin él, según lo que acepte el plan).
**Por qué:** Windsor contesta de su caché y la renueva cada 6 horas: el panel
mostraba la foto de la mañana aunque Jarvis preguntara cada 2 minutos. Y cada
reescritura innecesaria vaciaba la memoria de cálculo de las pantallas.
**Queda pendiente:** conectar Meta directo por su API (gratis, minutos de
atraso) o subir a Windsor Professional para bajar de 1 hora a 15 minutos.

## Origen de las ventas: cajas, no señales (21 de septiembre de 2026)
**Decisión:** cada venta cae en **una sola** caja y las cajas suman exacto el
total de Shopify; la diferencia contra los píxeles se desarma en términos que
también suman exacto.
**Por qué:** la primera versión daba señales que se pisaban entre sí (una venta
podía ser recompra y a la vez de un nombre sin enlazar) y no sumaban el total,
y eso se lee como números que no cuadran.

## Anuncios por campaña (21 de septiembre de 2026)
**Decisión:** se guardan los anuncios de Windsor (`AdCreativo`,
`AdCreativoDia`, 120 días) y se sincronizan **aparte** de las campañas, cada
30 minutos.
**Por qué:** son muchas más filas y, si Windsor rechaza un campo de anuncio, no
puede arrastrar a la sincronización de campañas, de la que dependen el panel y
el control.

## Los pedidos del control salen de la planilla del equipo (22 de septiembre de 2026)
**Decisión:** el control publicitario cuenta los pedidos de la planilla de
Google que lleva el equipo de ventas, no los de Shopify. Un pedido es **una
fila** y **cuentan todos los estados**, cancelados incluidos. Shopify solo se
usa para los días que la planilla no cubre, y nunca mezclado dentro de un mismo
día.
**Por qué:** Emilia revisa el control contra esa planilla producto por producto.
Shopify se le acerca —agosto daba 11.804 contra 11.753— pero cuenta otra cosa:
los pedidos de Funnelish no están y los estados no son los del equipo. Un
número que no coincide con ninguna de las dos planillas, y que nadie puede
reproducir a mano, es peor que uno que no está. Verificado: del 1 al 21 de
septiembre da 104 pedidos de "Cepillo de inodoro desechable" y 136 de "Shampoo
aceite de batana", exactamente lo que ella lee.
**Cómo se lee:** la planilla está compartida como "cualquiera con el enlace", así
que se baja su CSV sin credenciales. **Solo lectura.** Las pestañas de mes se
descubren solas, así que un mes nuevo entra sin tocar nada.
**Lo que no se hace:** no se borra. El equipo elimina de la planilla los meses de
más de dos meses; en Jarvis se quedan, o cada dos meses cambiaría solo el
resultado de un mes cerrado.
**Queda pendiente:** los nombres de la planilla que no coinciden con ninguno
nuestro hay que enlazarlos a mano una vez (Control › Enlazar pedidos). Se
enlazan a mano y no por parecido a propósito: "Ampolla reafirmante Deep
Collagen" puede ser *DEEP COLLAGEN AMPOULE* o *SUNGBOON DEEP COLLAGEN*, y
elegir mal mueve cientos de pedidos al producto equivocado sin que nadie se
entere.

## Un período para todo Contenido (22 de septiembre de 2026)
**Decisión:** las seis pestañas de Contenido comparten el período que se elige
arriba, y viaja en la dirección.
**Por qué:** cada una traía su propio recorte —el día a día abría en hoy,
Rendimiento tenía 7/30/90 días, Lotes y Campañas no tenían ninguno— así que la
misma pregunta se contestaba distinto en cada pantalla. Emilia lo pidió para
Rendimiento; Sebastián dijo "mejor en todas".

## El SKU de Shopify es el ID de Dropi (22 de septiembre de 2026)
**Decisión:** se guarda el SKU de la primera variante de Shopify en
`Product.sku` y se refresca cada hora. Se muestra al lado del nombre, se busca
por él y se copia de un toque.
**Por qué:** es el número con el que Fabricio y Emilia piensan y el que Fabricio
pone adelante en el nombre de sus campañas. Y dice algo más: tener SKU
significa estar conectado a Dropi, o sea que el producto se despacha. Los que
no lo tienen son catálogo viejo — de ahí "Productos sin SKU" en Sin
nomenclatura, que es la lista para depurar los cientos que nadie limpió.
**Lo que no se hace:** si el producto desapareció del catálogo NO se le borra el
SKU que tenía; mandarlo a la lista de "para depurar" por una consulta que
volvió corta sería un error caro.

## El ángulo del anuncio se lee del nombre, y no se adivina (22 de septiembre de 2026)
**Decisión:** `categoria-anuncio.ts` deduce el ángulo y el formato de los
nombres del anuncio, del conjunto y de la campaña, con los 30 ángulos y 16
formatos de Super Ads más las formas en que el equipo los escribe de verdad.
Cuando el nombre no dice nada, queda vacío y en pantalla sale "sin clasificar".
**Por qué:** es la pregunta para la que existe el tablero de contenido —"¿qué
ángulo funciona?"— y la tabla de anuncios solo decía qué creativo anduvo. El
ángulo se busca primero en el CONJUNTO porque es donde el equipo lo pone
("nosotros manejamos los ángulos a nivel de conjunto de anuncios").
**Por qué no se adivina:** un ángulo inventado contamina justo la respuesta que
se está buscando. "Sin clasificar" es información: esa campaña se subió sin
nomenclatura y no se va a poder comparar.
**Queda pendiente (del equipo):** que las campañas nuevas traigan el ángulo en
el nombre. Esto lee lo que ya está escrito, que es la mitad del trabajo.

## El CPA de equilibrio se despeja de la fila, no se calcula aparte (22 de septiembre de 2026)
**Decisión:** sale de `(ingresos − operativos − administrativos) ÷ pedidos`
sobre la misma fila que el control ya calculó, y se muestra en la celda del CPA
junto al objetivo del producto.
**Por qué:** Fabricio lo pidió para que los asesores sepan "hasta cuándo
podemos". Y se despeja de la fila para que, si mañana cambia cómo se reparte la
administración, el equilibrio cambie con ella en vez de quedarse mintiendo.

## Pendiente de confirmar (no decidido aún)
- Acceso al repo completo del sistema en Railway (hoy solo hay extractos
  de referencia, ver `REFERENCIA_SISTEMA_RAILWAY.md`).
- Regla exacta que dispara una recomendación automática (arrancar simple:
  ej. caída/suba de CPA por encima de un umbral en N días).
- Si `USER_CREATION_CODE` debe poder cambiarse desde el panel más adelante
  o queda fijo.
- El precio de la calculadora sale de Shopify porque Dropi todavía no entregó
  su clave de integración (no hay ninguna `DropiConnection` cargada). Cuando la
  entreguen, el precio pasa a salir de ahí; mientras tanto la pantalla dice de
  dónde sale, para que la diferencia no se lea como un error.
