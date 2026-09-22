# Manual de uso de Jarvis

**Para quién es:** el equipo de Importadora Bella: dirección, líderes de producto, editores y trafficker.
**Dónde está:** https://jarvisecom.com
**Última revisión:** 19 de septiembre de 2026

> Jarvis junta en un solo lugar lo que antes vivía en el Excel de control publicitario, el Control Super Ads, Notion y los paneles de Meta, TikTok y Shopify. Los datos se actualizan solos cada 5 minutos: no hace falta apretar nada para "traer" números.

---

## Índice

1. [Primeros pasos](#1-primeros-pasos)
2. [Guía de operación de ventas](#2-guía-de-operación-de-ventas)
3. [Guía del workflow de contenido](#3-guía-del-workflow-de-contenido)
4. [Seguimiento de actividad](#4-seguimiento-de-actividad-solo-administrador)
5. [Solución de problemas](#5-solución-de-problemas)

---

## 1. Primeros pasos

### Entrar

1. Abre https://jarvisecom.com e inicia sesión con tu correo y tu clave.
2. La primera vez la app te pide cambiar la clave. Mínimo 8 caracteres.
3. Si fallas la clave 8 veces seguidas, la cuenta queda frenada 15 minutos desde esa conexión. Espera, o pídele a un administrador que te la resetee desde **Usuarios**.

Cambiar la clave **cierra la sesión en todos tus otros dispositivos**. Si crees que alguien entró con tu cuenta, cambia la clave y listo.

### Quién ve qué

| Rol | Qué puede hacer |
|---|---|
| **OWNER** (dirección) | Todo. Crear usuarios, conectar cuentas, ver cifras de dinero (si tiene el permiso) y nómina (si tiene el permiso). |
| **DIRECTOR** | Gestionar contenido, campañas y el equipo. Ve la pantalla de Rendimiento. |
| **EDITOR** | Ve y edita las piezas de **los productos que tiene a cargo** (según la base de Notion *PRODUCTOS ORDEN*). |
| **PENDING** | Cuenta recién creada, sin acceso hasta que un OWNER le asigne rol. |

Ver dinero (ingresos, utilidad, costos) y ver nómina son **permisos por persona**, no por rol. Un OWNER nuevo no ve la facturación hasta que alguien se lo habilite en **Usuarios**.

### El menú

| Pantalla | Para qué sirve |
|---|---|
| **Panel** | El día y el período de un vistazo: ventas, gasto, CPA, alertas. |
| **Control publicitario** | El Excel de control, automático: pedidos reales, gasto, CPA, utilidad por producto y por día. |
| **Rentabilidad** | Margen por producto con su economía (precio, costo, flete, efectividad). |
| **Calculadora de precios** | A cuánto vender, y qué deja ese precio con la confirmación y las devoluciones reales. Antes eran dos pantallas ("Calculadora" y "Costeo y utilidad"); quedó una sola. |
| **Origen de las ventas** | De dónde viene cada venta: si su producto tenía anuncios ese día, y en qué plataforma. |
| **Productos** | Ficha de cada producto: piezas, referencias, repositorio de links, responsables. |
| **Contenido** | Calendario, Día a día, Requerimientos, Lotes, Referencias, Gestión de campañas, Rendimiento. |
| **Sin nomenclatura** | Campañas cuyo nombre no permite saber de qué producto son. |
| **Clientes** | Compradores, recompras y exportación a CSV. |
| **Torre logística** | Envíos por provincia y transportadora (Dropi). |
| **Reportes diarios** | PDFs del cierre de cada día e informes descargables. |
| **Estadísticas CEO** | Resumen ejecutivo para dirección. Abre en **Campañas del año**: gasto, CPA y conversiones por mes, por plataforma y por producto. |
| **Preguntarle a Jarvis** | Chat con el asistente: responde sobre tus datos y propone acciones (que nunca se ejecutan sin aprobación). |
| **Chat interno** | Mensajes del equipo, canales y sala de voz. |
| **Notificaciones** | Avisos: tus pendientes, lo que terminaste, alertas. |
| **Conexiones** | Estado de Shopify, Meta/TikTok (vía Windsor), Notion y Dropi. |
| **Usuarios** / **Nómina** / **Configuraciones** | Administración. |

### Buscar un producto

En todas las pantallas donde se elige un producto (calculadora, requerimientos, lotes, gestión de campañas, día a día, sin nomenclatura, filtros) **se escribe, no se busca en una lista**. Sirven cuatro formas:

- el **código**: `1771`,
- el **comienzo del nombre**: `gotas de`,
- **varias palabras empezadas**: `got dren`,
- las **iniciales**: `gdl` encuentra *Gotas De drenaje Linfático*.

No hace falta poner tildes ni mayúsculas. Con las flechas se recorre la lista y con Enter se elige.

---

## 2. Guía de operación de ventas

### 2.1 De dónde sale cada número

| Número | Fuente | Cada cuánto |
|---|---|---|
| **Pedidos reales** | Shopify: las órdenes de la tienda | 5 minutos |
| **Gasto en pauta** | Meta Ads y TikTok Ads, vía Windsor.ai | 5 minutos (últimos 7 días) + repaso semanal de 90 días |
| **Compras atribuidas** | Lo que dicen Meta y TikTok que vendieron | Igual que el gasto |
| **Precio, producción, flete, efectividad** | *Economía por producto* (cargada por mes, como la pestaña VARIABLES del Excel) | Manual |
| **Gasto administrativo** | Total del mes cargado en *Economía por producto* | Manual, una vez por mes |
| **Responsables de producto** | Base de Notion *PRODUCTOS ORDEN* | 10 minutos |

**Importante:** las plataformas siempre se atribuyen más compras de las que hubo, porque Meta y TikTok cuentan la misma venta cada una. Por eso el control usa los **pedidos reales de Shopify** para el CPA y la utilidad, y muestra lo atribuido solo como referencia. En julio: 7.473 pedidos reales contra 8.022 atribuidos.

### 2.2 Filtrar por fechas

Todas las pantallas de números tienen el mismo selector arriba:

- **Atajos:** Hoy, Ayer, 7 días, 30 días, Este mes, Mes pasado, o cualquier mes.
- **Rango libre:** elige desde y hasta en el calendario.
- Las fechas son **días de Ecuador** (UTC−5). Un pedido de las 23:30 del martes cuenta el martes.

El día en curso siempre se muestra **en vivo y a medias**. El cierre de un día se escribe a las 23:00. Durante la semana siguiente se vuelve a calcular todas las mañanas, porque Meta y TikTok siguen atribuyendo compras días después: el martes cerrado el viernes puede tener algunas compras más que el martes cerrado el mismo martes.

### 2.3 Control publicitario (el Excel, automático)

**Resultados**: el período elegido en una tabla por producto.

| Columna | Cómo se calcula |
|---|---|
| Pedidos | Pedidos reales de Shopify. Un pedido = un producto (el renglón de mayor importe). No cuentan envío, garantía ni TESTEO. |
| Gasto | Todo lo que cobraron Meta y TikTok. Lo que no tiene producto va a la fila **Sin asignar**: no desaparece. |
| CPA | Gasto ÷ pedidos reales. |
| Pedidos efectivos | Pedidos × efectividad del mes. |
| Ingresos | Precio promedio × pedidos efectivos. |
| Gastos operativos | (Producción + flete) × pedidos efectivos. |
| Gastos administrativos | Total del mes ÷ 30, repartido cada día según los pedidos de cada producto. |
| **Utilidad** | Ingresos − gasto − operativos − administrativos. |

> El Excel original tenía un error en los gastos operativos (tomaba CPA mínimo + % de devoluciones, un $6,15 fijo). Jarvis usa producción + flete, que es lo que el Excel quería calcular. Por eso la utilidad de Jarvis es más baja que la del Excel en los meses viejos: es la correcta.

**Avisos en amarillo arriba de la tabla.** Léelos siempre:

- *"N productos sin economía del mes"*: esos productos no tienen precio ni efectividad cargados para ese mes, así que su utilidad sale en negativo (tienen gasto y no tienen ingresos). **Solución:** cargar su fila en *Economía por producto*.
- *"Mes sin gasto administrativo"*: falta el total del mes. La utilidad sale inflada.
- *"N pedidos sin producto"*: pedidos de Shopify cuyo nombre todavía no está enlazado. Ver *Enlazar pedidos*.

**Economía por producto**: equivale a la pestaña VARIABLES del Excel.

1. Elige el mes.
2. Completa efectividad, producción, flete y precio promedio por producto. Con **"traer del mes anterior"** se copian los valores del mes previo y solo corriges lo que cambió.
3. Arriba va el **gasto administrativo del mes** y el enlace al documento de administración de donde sale.

**Enlazar pedidos**: lo que la tienda vendió y todavía no tiene producto, ordenado por cantidad de pedidos. Para cada nombre, elige:

- el **producto** al que pertenece,
- **testeo** (existe, pero no cuenta en el control), o
- **no es producto** (envío, garantía, regalo).

Vale para siempre, y los meses anteriores se recalculan solos en unos segundos.

### 2.4 Panel y métricas de atribución

Arriba del panel hay una tira de indicadores rápidos: **ventas**, **ventas por hora**, **CPA general** (con su objetivo al lado, en verde o rojo), **gasto de Meta y de TikTok** y **a qué hora compran los clientes**. Aunque el filtro esté en otro período, la franja **Hoy** muestra siempre cómo viene el día.

En **Rendimiento de campañas**, al elegir Meta o TikTok aparece el **CPA de esa plataforma** (su gasto dividido por las compras que ella misma se atribuye). Cambiar de plataforma no mueve la página de lugar.

**De cuándo son los números:** debajo del título *Ventas reales contra lo que atribuye la pauta* se lee hace cuánto entraron las ventas de Shopify (cada 2 minutos) y de qué hora son los datos de Meta y TikTok, con una **cuenta regresiva hasta la próxima actualización**. Windsor renueva esos datos una vez por hora, así que si la pauta se ve baja, ahí se ve si es porque faltan datos o porque de verdad bajó. El mismo contador está arriba a la derecha, en el encabezado.

La franja de atribución del panel compara tres números del período:

1. **Órdenes reales** (Shopify).
2. **Atribuidas** (lo que dicen Meta + TikTok).
3. **Lo que el píxel no registró**: la diferencia. Se debe a la zona horaria, iOS y la ventana de atribución. **No son ventas de otro origen.** Se revisó pedido por pedido el 17 de septiembre: cero duplicados, cero cuentas internas.

Si las atribuidas superan a las reales (pasa casi siempre), es **doble conteo entre plataformas**, no ventas de más.

### 2.5 Gestión de campañas

En **Contenido → Gestión de campañas**:

- Por defecto se ven las **activas**, como en Notion. El selector cambia a inactivas o todas.
- Busca por nombre de campaña o por cuenta publicitaria.
- Cada campaña muestra el **gasto de los últimos 7 días**.
- **Asignar producto a mano:** si una campaña cayó en el producto equivocado, corrígela acá. La sincronización **respeta** la corrección y no la vuelve a pisar.

Para que una campaña caiga sola en su producto, su nombre tiene que empezar con el código: `134142 / TE GINSENG / ABO / COST CAP`. Con lote: `134142-3 / ...`. Las que no lo cumplen aparecen en **Sin nomenclatura**.

### 2.6 Exportar reportes

| Qué | Dónde | Formato |
|---|---|---|
| Cierre del día | **Reportes diarios**: se genera solo a medianoche de Ecuador | PDF |
| Informe de un período | **Reportes diarios → Descargar informe**: elige el rango | PDF |
| Clientes | **Clientes → Descargar CSV** | CSV (abre en Excel/Sheets) |
| Reporte semanal | Llega por correo a dirección los lunes | Correo |

### 2.7 Origen de las ventas

Responde "¿de dónde salieron las ventas que la pauta no explica?" sin dejar ninguna afuera. Cada venta cae en **una sola caja**:

| Caja | Qué significa |
|---|---|
| Pauta solo en Meta / solo en TikTok / en las dos | El producto tenía campañas gastando **ese día** en esa plataforma. |
| Producto sin pauta ese día | No gastó un dólar: es recompra, recomendación, WhatsApp o un anuncio viejo. |
| Producto sin identificar | El nombre de Shopify todavía no está enlazado a un producto. Se arregla en *Control publicitario → Enlazar pedidos*. |
| Testeo | Producto marcado como testeo; el control no lo cuenta. |

Las cajas **suman exactamente** las órdenes de Shopify, y abajo está la lista venta por venta con su número de orden (y un archivo para Excel con todas). La pantalla también desarma la diferencia contra los píxeles en partes que suman exacto, y calcula el **CPA general sobre todas las ventas** —se rastreen o no— contra el CPA máximo de cada producto pesado por lo que vendió.

Lo que **no** se puede saber hoy: qué anuncio exacto trajo a cada comprador. Las ventas entran por Funnelish y Releasit, que cobran fuera de Shopify y no dejan los utm en la orden. El día que el embudo los pase, aparecen solos.

### 2.8 Anuncios de cada campaña

En la ficha de un producto (**Productos → abrir uno**), el reporte muestra los **mejores anuncios del producto** y, al tocar una campaña, **sus anuncios**: compras, gasto, CPA, CTR, CPM, ROAS, días con gasto y un veredicto contra el CPA objetivo del producto (*escalar*, *bien*, *mirar*, *apagar* o *poco dato* con menos de tres compras). Se traen de Meta y TikTok cada 30 minutos.

---

## 3. Guía del workflow de contenido

El flujo sigue el Control Super Ads: **Referencia → Requerimiento (pieza) → Lote → Campaña → Resultado**.

### 3.1 Crear un concepto creativo nuevo

**Opción A: desde una referencia.**

1. **Productos → (el producto) → Banco de referencias → Agregar**: link del anuncio de referencia, formato, ángulo y notas.
2. Desde la referencia, **crear pieza**: la pieza nace con el producto y el link ya cargados.

**Opción B: directo en Requerimientos.**

1. **Contenido → Requerimientos**.
2. En la **fila vacía de abajo**, escribe el nombre de la pieza y presiona Enter. Se crea al instante. Así se suben las cinco del día sin formularios.
3. Completa en la misma fila: tipo, fase, adset, formato visual, ángulo, awareness, mercado y situación.

**Reglas que valida el sistema:**

- **No se repite el formato visual dentro de un mismo adset.** El desplegable muestra tachado el formato ya usado y el sistema rechaza el duplicado.
- Cada producto puede tener **sus propios ángulos**, que se agregan desde el mismo desplegable.
- A las **8:00** se reclaman las piezas del día sin clasificar a los responsables del producto, y dirección recibe cuáles y de quién.

### 3.2 Asignar editores y creadores

- **Responsable de la pieza:** en la tarjeta o en la fila, campo *Responsable*.
- **Fecha de entrega:** al ponerla, la pieza aparece sola en el **Día a día** de esa persona en esa fecha. Si se borra la fecha, sale del tablero.
- **Responsables del producto:** salen de la base de Notion *PRODUCTOS ORDEN*. Para cambiar quién lleva un producto, cámbialo **en Notion**. Jarvis lo toma en 10 minutos.
- Solo los responsables del producto y dirección pueden ver y editar sus piezas.

### 3.3 Día a día y calendario

- **Día a día**: cada día dice cuántas tareas hay, cuántas están listas y cuántas pendientes, y de quién, sin abrirlo. Quien edita marca su avance (*en progreso*, *listo*) y ese avance no lo pisa nadie.
- Cuando una pieza queda **Aprobada, Realizada, Editada o Testeada**, su tarea del tablero pasa sola a **Hecho**.
- **Calendario**: el contenido planificado más las actividades de cada persona. El **+** de cada día agenda una actividad.

### 3.4 Subir assets

Los videos e imágenes **no se suben a Jarvis**: viven en Google Drive (o donde el equipo ya los guarda) y Jarvis guarda **el link**.

1. En la pieza: cada entrega es una **versión** con su link ("Link de la nueva versión…"). La versión anterior queda guardada, así se ve cómo evolucionó la pieza.
2. En la ficha del producto: **Repositorio** para carpetas, links y notas compartidas del producto.
3. Solo se aceptan links `http(s)://`. Si pegas `drive.google.com/...` sin el `https://`, se agrega solo.

**Importante:** el archivo de Drive tiene que estar compartido con quien lo va a abrir. Jarvis no cambia los permisos de Drive.

### 3.5 Aprobar guiones y piezas

Los estados de una pieza avanzan así:

`PENDIENTE → EN EDICIÓN → LISTO PARA REVISAR → APROBADO → REALIZADO / EDITADO → TESTEADO`

1. Quien edita pasa la pieza a **Listo para revisar** cuando el guion o el video está.
2. El responsable del producto (o dirección) la abre, revisa el link y la pasa a **Aprobado**, o la devuelve a **En edición** con un comentario.
3. Cada cambio queda en el historial de la pieza, con quién lo hizo y cuándo.

### 3.6 Vincular el contenido con su rendimiento

1. En **Contenido → Lotes** se arma el lote (ronda) del producto. Su nomenclatura es `{código}-{número}`, por ejemplo `134142-3`.
2. La campaña en Meta o TikTok se nombra con esa nomenclatura: `134142-3 / TE GINSENG / ...`.
3. Jarvis enlaza sola la campaña con su lote y, por el lote, con las piezas y quién las hizo.
4. El rendimiento (gasto, compras, CPA, hook rate) aparece en la ficha de la pieza, en el lote y en **Contenido → Rendimiento** (solo dirección), por persona.

Si el nombre de la campaña no sigue la nomenclatura, el enlace no se puede hacer: la campaña aparece en **Sin nomenclatura** para corregirla.

---


## 4. Seguimiento de actividad (solo administrador)

En **Configuraciones → Seguimiento de actividad** el administrador (OWNER) ve, por persona y por rango de fechas:

- **Pantallas** que abrió, con sus filtros ("Control publicitario › Enlazar pedidos · julio 2026").
- **Acciones**: crear, editar o borrar piezas, enlazar pedidos, cambiar la economía, crear usuarios, etc. Se registran al pedirse: también aparecen las que el sistema rechazó (sin permiso o datos inválidos).
- **Descargas** (CSV de clientes, PDF de reportes), **búsquedas** en cualquier buscador y **preguntas a Jarvis**.
- **Entradas, salidas e intentos de entrada fallidos**, con la IP y el equipo (p. ej. "Chrome en Windows").

Cada día muestra de qué hora a qué hora hubo actividad y cuántas pantallas y acciones. Los intentos fallidos salen en rojo. Se guarda 90 días.

El registro se hace en el servidor: no se puede apagar desde el navegador. Es recomendable que el equipo sepa que existe (ver el reglamento interno).

---

## 5. Solución de problemas

### Fallos de sincronización

**¿Cómo sé si los datos están al día?** Mira la pantalla **Conexiones**: cada fuente muestra hace cuántos minutos sincronizó por última vez. Lo normal es menos de 10 minutos. Para dirección hay además un chequeo público en https://jarvisecom.com/api/health: `"datosFrescos": true` quiere decir que todo está bien.

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El panel muestra **0 ventas** a media tarde | La sincronización con Shopify está caída | Mira *Conexiones*. Si Shopify dice error hace más de 30 minutos, avisa a soporte técnico. |
| El **gasto de hoy** no aparece | Normal en las primeras horas: Meta y TikTok reportan con retraso | Espera. Si a las 12:00 sigue en 0, mira *Conexiones*. |
| El gasto de Meta/TikTok se ve **viejo** a media tarde | Windsor guarda lo que pide y lo renueva una vez por hora (según el plan) | Mira el contador del encabezado: dice de qué hora son los datos y cuánto falta para los próximos. Para bajar a 15 minutos hace falta el plan Professional de Windsor. |
| El gasto de una cuenta de TikTok **no aparece nunca** | La cuenta no está conectada en Windsor.ai | Conectarla en Windsor (lo hace quien administra Windsor). En 5 minutos aparece. La historia de 90 días se trae en el repaso semanal. |
| El **gasto de ayer cambió** | Normal: las plataformas ajustan días después | El cierre se recalcula solo durante 7 días. |
| Una campaña cayó en el **producto equivocado** | El nombre tiene un código de otro producto | Corrígela en *Gestión de campañas*. La corrección se respeta. |
| Un producto tiene **utilidad negativa rara** | Falta su economía del mes | Carga su fila en *Economía por producto*. |
| Responsables de producto **desactualizados** | Cambio reciente en Notion | Espera 10 minutos. Si no cambia, revisa que el nombre en Notion coincida con el usuario de Jarvis. |
| Las **tareas de Notion no aparecen** | La conexión con Notion perdió el permiso | *Conexiones → Notion → Reconectar* (lo hace un OWNER). La base tiene que estar compartida con la integración de Notion. |

### Reconectar cuentas publicitarias

Meta y TikTok **no se conectan en Jarvis**: se conectan en **Windsor.ai**, que es quien tiene el permiso de leer las cuentas.

1. Entra a Windsor.ai con la cuenta de la empresa.
2. **Data sources → Facebook Ads / TikTok Ads**: si una cuenta dice *expired* o *error*, **Reconnect** y vuelve a autorizar con el usuario administrador de la cuenta publicitaria.
3. Para sumar una cuenta nueva: *Add account* en el mismo conector.
4. En 5 minutos Jarvis la ve. En **Conexiones** aparece con su nombre.

**Shopify:** solo un OWNER, en **Conexiones → Shopify**. El dominio tiene que ser `tu-tienda.myshopify.com`: Jarvis rechaza cualquier otro, por seguridad.

**Si Jarvis responde "Demasiados pedidos seguidos":** es el freno de seguridad. Espera los minutos que dice el mensaje. Conectar se permite 10 veces cada 10 minutos.

### Errores con videos y archivos

| Síntoma | Causa | Qué hacer |
|---|---|---|
| El link de la pieza **no abre** | El archivo de Drive no está compartido | En Drive: *Compartir → Cualquier persona con el enlace* (o con el equipo). |
| La **miniatura no se ve** | El link no es de una imagen directa, o Drive lo bloquea | Usa un link directo a la imagen, o déjala vacía. La pieza funciona igual. |
| **"El link no es válido"** | No empieza con `http(s)://` | Pega el link completo, copiado de la barra del navegador. |
| La **foto de perfil** no sube | Pesa más de 300 KB o no es PNG, JPG o WEBP | Achícala o conviértela. |

### Otros

- **"Esta pantalla no se pudo cargar"**: aprieta *Reintentar*. Si vuelve a pasar, manda el **código** que aparece abajo a soporte técnico: con ese código se encuentra el error exacto en los registros.
- **Me sacó de la sesión:** alguien cambió o reseteó tu clave, o pasaron 30 días. Vuelve a entrar.
- **No veo cifras de dinero:** es un permiso aparte. Pídelo a dirección.
- **La campana no suena en el celular:** activa las notificaciones del navegador en *Configuraciones* y acepta el permiso cuando el navegador lo pida.
