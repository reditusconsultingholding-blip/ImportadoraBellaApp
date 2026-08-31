import type { SessionPayload } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";

// Qué le explica el recorrido guiado a cada quien.
//
// El contenido está separado de la mecánica (`capacitacion-tour.tsx`) para que
// corregir una explicación —o agregar una sección nueva— sea editar una lista
// y no tocar un componente con foco, teclado y navegación adentro.
//
// La regla al escribir cada paso: contar para qué sirve la sección en la
// operación, no describir botones. Y no prometer nada que la pantalla no haga:
// un recorrido que menciona una función inexistente es peor que no tenerlo,
// porque la persona la busca y termina creyendo que no sabe usar la
// herramienta.

export type RolUsuario = SessionPayload["role"];

export type PasoCapacitacion = {
  /** Estable: es la clave de React y sobrevive a que se reordene la lista. */
  id: string;
  /** A qué pantalla lleva el paso. */
  ruta: string;
  /** El nombre de la sección tal como figura en el menú. */
  seccion: string;
  titulo: string;
  /** Para qué sirve la sección en el negocio, en dos o tres frases. */
  texto: string;
  /** Lo concreto: qué se hace ahí, y qué límites tiene. */
  puntos: string[];
  /** Roles a los que se les muestra este paso. */
  roles: RolUsuario[];
  /**
   * Nómina no depende del rol sino de un permiso por persona que se relee de
   * la base — ver `payroll-access.ts`. Un administrador puede no tenerlo.
   */
  requierePermisoNomina?: boolean;
};

const ROLES: RolUsuario[] = ["OWNER", "DIRECTOR", "EDITOR", "PENDING"];

// Los grupos salen de las mismas funciones que decide el menú y que aplican
// las pantallas. Escribir los roles a mano en cada paso funcionaría hasta el
// día que cambie un permiso: ahí el recorrido empezaría a explicar secciones
// que la persona no puede abrir.
const CON_PIPELINE = ROLES.filter(canAccessPipeline);
const CON_NUMEROS = ROLES.filter(canManagePipeline);
/** Quien produce pero no dirige: ve el pipeline, no los números del negocio. */
const SOLO_EDITOR = CON_PIPELINE.filter((rol) => !canManagePipeline(rol));
/** Todavía sin rol asignado: no entra a nada del trabajo diario. */
const SIN_ROL = ROLES.filter((rol) => !canAccessPipeline(rol));
const SOLO_DUENO: RolUsuario[] = ["OWNER"];

export const PASOS: PasoCapacitacion[] = [
  {
    id: "bienvenida",
    ruta: "/dashboard",
    seccion: "Antes de empezar",
    titulo: "Bienvenido al panel de Importadora Bella",
    texto:
      "Este recorrido te lleva por las secciones a las que tienes acceso y te cuenta para qué sirve cada una en la operación. Son unos minutos y lo puedes cerrar cuando quieras: si lo dejas por la mitad, retomas donde ibas.",
    puntos: [
      "Todo lo que ves acá sale de tres fuentes conectadas: Meta Ads, TikTok Ads y Shopify.",
      "El botón «Capacitación», arriba a la derecha, te devuelve este recorrido cuando lo necesites.",
    ],
    roles: CON_PIPELINE,
  },
  {
    id: "sin-rol",
    ruta: "/dashboard",
    seccion: "Tu cuenta",
    titulo: "Tu cuenta todavía no tiene un rol asignado",
    texto:
      "Hasta que un administrador te asigne rol no vas a poder entrar al pipeline, a los números del negocio ni al chat del equipo. Mientras tanto puedes dejar listo tu perfil y tu contraseña.",
    puntos: [
      "Pídele a quien administra el panel que te asigne rol de Director operativo o de Editor.",
      "Cuando lo tengas, este recorrido te va a mostrar las secciones que te toquen.",
    ],
    roles: SIN_ROL,
  },
  {
    id: "panel-gestion",
    ruta: "/dashboard",
    seccion: "Panel",
    titulo: "Lo que se cobró contra lo que la pauta se atribuye",
    texto:
      "Es la pantalla de todos los días. Eliges el período y ves las ventas reales de Shopify y, al lado, cuántas compras se atribuyen Meta y TikTok. Esos dos números nunca coinciden, y la diferencia es justo lo que hay que mirar antes de tocar una campaña.",
    puntos: [
      "La tabla «Por producto y campaña» ordena por qué tan lejos está el CPA de su objetivo, no por gasto: una campaña chica muy pasada pesa más que una grande sana.",
      "El panel de alertas resume qué apagar, qué escalar y cuánta plata hay en juego. Si no hay nada urgente no aparece, así que verlo vacío es buena señal.",
      "En el Pulso abres un producto, le cargas precio, costo y CPA objetivo, y le propones una acción a dirección.",
      "El período viaja en la dirección de la página: puedes pasarle el link a alguien y va a ver lo mismo que tú.",
    ],
    roles: CON_NUMEROS,
  },
  {
    id: "panel-editor",
    ruta: "/dashboard",
    seccion: "Panel",
    titulo: "Cómo le está yendo a lo que editaste",
    texto:
      "Acá eliges el período y ves las ventas de la tienda y la tabla de rendimiento de campañas. Te sirve para saber si las piezas que hiciste están funcionando: cada fila compara el CPA que está pagando la campaña contra el objetivo del producto.",
    puntos: [
      "El estado de cada fila —Va bien, Optimizar, Va mal— sale de esa comparación, no de una opinión.",
      "Las alertas, el pulso y el detalle de atribución por plataforma son de dirección: a ti no te aparecen.",
    ],
    roles: SOLO_EDITOR,
  },
  {
    id: "ceo",
    ruta: "/dashboard/ceo",
    seccion: "Panel del CEO",
    titulo: "El negocio entero sin abrir seis pantallas",
    texto:
      "Junta en pestañas lo que de otro modo hay que ir a buscar: resumen del período, productos, rentabilidad, qué hacer hoy y equipo —más nómina, si tienes ese permiso—. Son exactamente los mismos números que ve el equipo, no una cuenta aparte.",
    puntos: [
      "«Qué hacer hoy» ordena las alertas por plata en juego, no por tipo.",
      "«Equipo» muestra cuántas piezas hizo cada quien en el período, cuántas terminó y el CPA medio de lo suyo.",
      "Es de solo lectura: acá se decide, y se ejecuta en las otras pantallas.",
    ],
    roles: SOLO_DUENO,
  },
  {
    id: "pipeline-gestion",
    ruta: "/dashboard/pipeline",
    seccion: "Pipeline",
    titulo: "Quién está haciendo qué pieza y para cuándo",
    texto:
      "Cada tarjeta es un requerimiento: una pieza de anuncio con su producto, su tipo, su ángulo, su editor y su fecha de entrega. El tablero se mueve arrastrando entre columnas y lo que pasó su fecha queda marcado en rojo como vencido.",
    puntos: [
      "Las columnas son Pendiente, En edición, Listo para revisar, Aprobado, Realizado, Editado y Testeado.",
      "Al abrir una tarjeta cargas las versiones con su link, los enlaces de la publicación y las métricas de la pieza: hook rate, CTR, hold rate, compras, CPA, frecuencia y CPM.",
      "Cada requerimiento tiene su propio hilo con menciones: la conversación de esa pieza queda pegada a la pieza y no en un grupo aparte.",
      "Un editor solo ve lo que tiene asignado; tú ves todo y eres quien reasigna.",
      "El archivo histórico de creativos importados no entra a este tablero: eso vive en la ficha del producto.",
    ],
    roles: CON_NUMEROS,
  },
  {
    id: "pipeline-editor",
    ruta: "/dashboard/pipeline",
    seccion: "Pipeline",
    titulo: "Tus piezas y en qué punto va cada una",
    texto:
      "Acá ves solo los requerimientos que están a tu nombre, con su fecha de entrega. Mover la tarjeta de columna es la forma de avisar en qué punto va cada pieza; lo que pasó su fecha queda marcado en rojo.",
    puntos: [
      "Las columnas son Pendiente, En edición, Listo para revisar, Aprobado, Realizado, Editado y Testeado.",
      "Al abrir la tarjeta subes cada versión con su link y su nota, y cargas los enlaces de las publicaciones de TikTok y Facebook.",
      "A qué producto pertenece la pieza y quién es el responsable lo define dirección: esos dos campos no los puedes cambiar.",
      "Cada requerimiento tiene su propio hilo con menciones, para preguntar sobre esa pieza sin salir de ella.",
    ],
    roles: SOLO_EDITOR,
  },
  {
    id: "productos-gestion",
    ruta: "/dashboard/productos",
    seccion: "Productos",
    titulo: "En qué estado está cada producto",
    texto:
      "Un renglón por producto seguido, con su pulso —sano, vigilar o riesgo—, el gasto, el CPA contra el objetivo, precio, costo, margen y cuántos creativos tiene en curso. Es la lista desde la que se decide dónde poner plata esta semana.",
    puntos: [
      "El CPA objetivo aparece como provisional mientras el producto no tenga cargado su costo real: hasta ahí es una estimación.",
      "Al expandir un producto editas precio, costo y CPA objetivo sin salir de la lista.",
      "La cola de aprobación de arriba es donde apruebas o rechazas lo que propuso el equipo. Aprobar un pedido de creativos crea los requerimientos en el Pipeline, ya asignados y notificados.",
      "Con el selector de catálogo eliges qué productos de Shopify se empiezan a seguir.",
      "La ventana es siempre de los últimos 30 días: acá no hay selector de período.",
    ],
    roles: CON_NUMEROS,
  },
  {
    id: "productos-editor",
    ruta: "/dashboard/productos",
    seccion: "Productos",
    titulo: "El contexto del producto para el que estás editando",
    texto:
      "Un renglón por producto con su pulso, el gasto de los últimos 30 días y el CPA contra el objetivo. Sirve para saber en qué situación está el producto antes de armarle piezas nuevas: si va bien, si hay que optimizarlo o si está en riesgo.",
    puntos: [
      "Al entrar a la ficha completa de un producto ves su historial de creativos y cómo le fue a cada uno.",
      "El precio, el costo y el CPA objetivo los carga dirección.",
      "La ventana es siempre de los últimos 30 días: acá no hay selector de período.",
    ],
    roles: SOLO_EDITOR,
  },
  {
    id: "rentabilidad",
    ruta: "/dashboard/rentabilidad",
    seccion: "Rentabilidad",
    titulo: "Qué producto deja plata de verdad",
    texto:
      "En contraentrega el margen bruto miente: el flete se paga por todo lo que se despacha —se confirme o no— y una parte vuelve. Esta tabla aplica la efectividad de confirmación y las devoluciones reales, así que un producto con 90% de margen y 30% de confirmación aparece en rojo acá y en verde en cualquier otro tablero.",
    puntos: [
      "Cada fila se abre y muestra el desarme completo: ingreso menos mercadería, menos flete, menos pauta.",
      "El filtro «Pierden plata» te deja la lista corta de lo que hay que arreglar o apagar esta semana.",
      "La utilidad se calcula sobre las compras que se atribuyen Meta y TikTok, no sobre las órdenes de Shopify. La pantalla te avisa cuánto se están inflando, para que compares productos entre sí y no lo tomes como plata contada.",
    ],
    roles: CON_NUMEROS,
  },
  {
    id: "clientes",
    ruta: "/dashboard/clientes",
    seccion: "Clientes",
    titulo: "Si el negocio recompra, y dónde vende",
    texto:
      "Junta las órdenes de Shopify por persona para responder dos preguntas de fondo: cuánta facturación viene de gente que vuelve a comprar, y en qué provincias se está vendiendo. Abajo, qué productos se llevan juntos, que es de donde salen los packs.",
    puntos: [
      "El cliente se identifica por el teléfono. Las órdenes que llegan sin teléfono no se le pueden atribuir a nadie y se cuentan aparte.",
      "En pantalla van los que más facturan; el botón de CSV baja la lista completa.",
      "Los pares de productos solo aparecen cuando la combinación se repitió al menos tres veces: una coincidencia suelta no es un pack.",
    ],
    roles: CON_NUMEROS,
  },
  {
    id: "calculadora",
    ruta: "/dashboard/calculadora",
    seccion: "Calculadora",
    titulo: "A qué precio vender, y qué ya no da",
    texto:
      "Arriba armas el precio de un producto con sus costos reales —producto, flete, gasto operativo, CPA, comisión de pasarela e IVA— más la confirmación y las devoluciones que tiene de verdad. Te devuelve el precio sugerido y, sobre todo, el CPA máximo que puedes pagar sin perder plata. Abajo lista los productos que hoy están dando utilidad negativa.",
    puntos: [
      "Los valores por defecto son los de Ecuador: 15% de IVA y alrededor de 4% de pasarela.",
      "La tabla de escenarios te muestra qué pasaría si subes diez puntos la confirmación, si armas packs o si bajas el CPA un 20%.",
      "Para guardar un análisis tienes que elegir un producto: sin eso los números se calculan igual, pero no quedan asociados a nada.",
      "En cada producto que está perdiendo puedes dejar escrito lo que decidió el equipo, para que la próxima vez no se discuta de cero.",
    ],
    roles: CON_NUMEROS,
  },
  {
    id: "reportes",
    ruta: "/dashboard/reportes",
    seccion: "Reportes diarios",
    titulo: "El cierre de ayer, en PDF",
    texto:
      "Cada medianoche, hora de Ecuador, se arma solo el reporte del día anterior y sale por correo. Acá tienes lo facturado ayer, el ticket promedio, la utilidad estimada y cuántas alertas quedaron para accionar, más los últimos catorce días en un gráfico.",
    puntos: [
      "El gráfico cruza día por día lo facturado con el gasto en pauta.",
      "«Generar el de hoy» arma el reporte a mano si no quieres esperar a la noche.",
      "Cada reporte queda guardado y se abre en PDF, que es lo que se pasa afuera del panel.",
    ],
    roles: CON_NUMEROS,
  },
  {
    id: "logistica",
    ruta: "/dashboard/logistica",
    seccion: "Torre logística",
    titulo: "Todavía no está en funcionamiento",
    texto:
      "Está pensada para mostrar la efectividad de entrega por provincia y por transportadora, que es lo que decide dónde conviene vender y con quién despachar. Hoy no tiene datos: depende de una conexión con Dropi que no está activa, y el módulo está declarado fuera del alcance actual.",
    puntos: [
      "Mientras no haya guías descargadas, la pantalla lo dice en vez de inventar números.",
      "Te la mostramos para que sepas que existe y no la busques en otro lado el día que se active.",
    ],
    roles: CON_PIPELINE,
  },
  {
    id: "nomina",
    ruta: "/dashboard/nomina",
    seccion: "Nómina",
    titulo: "Cerrar el pago de la semana",
    texto:
      "Una fila por persona activa con su forma de pago —semanal fijo, por día o por pieza entregada—, el monto, los descuentos por ausencia y lo que queda a pagar. Las piezas entregadas no se cuentan a mano: salen del Pipeline, por responsable y por semana.",
    puntos: [
      "Marcas una ausencia haciendo clic en el día de la semana y el descuento se recalcula solo. En «por pieza» la ausencia no descuenta, porque el pago ya depende de lo entregado.",
      "«Marcar semana como pagada» congela los montos y deshabilita la edición de esa semana: desde la pantalla no hay vuelta atrás.",
      "Ver la nómina es un permiso por persona, no un rol: hay administradores que no la ven, y solo quien ya la ve puede dárselo a otro.",
      "Dar de alta a alguien en la nómina todavía no se hace desde acá: las personas de esta tabla se cargan por fuera.",
    ],
    roles: ROLES,
    requierePermisoNomina: true,
  },
  {
    id: "chat",
    ruta: "/dashboard/chat",
    seccion: "Chat interno",
    titulo: "La conversación al lado de los números",
    texto:
      "Canales y mensajes directos con el equipo. La idea es que lo que se discute de un creativo o de una campaña quede en la misma herramienta donde está el dato, y no perdido en un grupo de mensajería.",
    puntos: [
      "Puedes responder a un mensaje, reaccionar, editar y borrar lo tuyo, y dejar fijados hasta tres links o notas por canal.",
      "Cada canal tiene una sala de voz para hablar sin salir del panel. En algunas redes no llega a conectar el audio; cuando pasa, la pantalla lo avisa.",
    ],
    roles: CON_PIPELINE,
  },
  {
    id: "notificaciones",
    ruta: "/dashboard/notificaciones",
    seccion: "Notificaciones",
    titulo: "Todo lo que el sistema te avisó",
    texto:
      "Menciones del chat, alertas para escalar, fatiga de anuncio, discrepancias entre lo que dicen las plataformas y lo que dice la tienda, y los reportes diarios. Cada aviso te lleva directo a la pantalla donde hay algo que hacer.",
    puntos: [
      "Los filtros de arriba te dejan quedarte con un solo tipo cuando se acumulan.",
      "La campana del encabezado muestra lo mismo sin sacarte de donde estás.",
    ],
    roles: CON_PIPELINE,
  },
  {
    id: "jarvis",
    ruta: "/dashboard/jarvis",
    seccion: "Preguntarle a Jarvis",
    titulo: "Preguntar en palabras, sin armar un reporte",
    texto:
      "Jarvis consulta los datos de la empresa y responde sobre campañas, productos y rentabilidad. Sirve para lo que no vale la pena ir a buscar a mano: qué producto necesita revisión urgente, cuánta utilidad dejó tal producto este mes.",
    puntos: [
      "Las conversaciones quedan guardadas en la lista de la izquierda, así que puedes volver a lo que preguntaste.",
      "Si propone pausar, reanudar o escalar una campaña, no lo ejecuta: te deja una tarjeta para aprobar o rechazar.",
      "Esa tarjeta vive mientras no recargues la página. Si vas a decidir sobre una propuesta, hazlo en el momento.",
      "El modo de voz usa el micrófono del navegador; en Firefox no funciona y queda el chat escrito.",
    ],
    roles: CON_PIPELINE,
  },
  {
    id: "conexiones",
    ruta: "/dashboard/conexiones",
    seccion: "Conexiones",
    titulo: "De dónde salen todos estos datos",
    texto:
      "Acá se pegan las credenciales de Meta Ads, TikTok Ads y Shopify. Si el panel deja de actualizarse, este es el primer lugar donde mirar: casi siempre es una cuenta que se desconectó o un token que venció.",
    puntos: [
      "Cada cuenta muestra si está conectada o pendiente, y tiene un «Sincronizar ahora» para traer los datos sin esperar al ciclo automático.",
      "Dropi figura como módulo a futuro: cargarle la clave hoy no enciende la torre logística.",
      "Cualquiera que entre al panel puede tocar estas credenciales. Son las llaves de las cuentas de publicidad reales.",
    ],
    roles: CON_PIPELINE,
  },
  {
    id: "configuracion",
    ruta: "/dashboard/configuracion",
    seccion: "Configuraciones",
    titulo: "Tu cuenta",
    texto:
      "Tu foto, tu nombre, tu fecha de nacimiento y tu teléfono, y desde acá cambias tu correo y tu contraseña. Es tu ficha personal: la configuración de la empresa no está en esta pantalla.",
    puntos: [
      "Desde acá también activas los avisos push del navegador, para enterarte de una alerta sin tener el panel abierto.",
    ],
    roles: ROLES,
  },
  {
    id: "usuarios",
    ruta: "/dashboard/usuarios",
    seccion: "Usuarios",
    titulo: "Quién entra, con qué rol y quién ya se capacitó",
    texto:
      "Das de alta a la gente, le asignas rol y decides quién ve la nómina. El rol es lo que define qué secciones ve cada quien: un director operativo ve los números y el pipeline completo, un editor solo las piezas que tiene asignadas.",
    puntos: [
      "Crear una cuenta pide además un código de autorización: sin eso no se crea, aunque alguien llegue a esta pantalla. Cuando está configurado el código rotativo, lo ves en tu perfil y se renueva cada medio minuto.",
      "Ver la nómina es un permiso aparte del rol, y solo alguien que ya la ve puede dárselo a otro.",
      "Abajo, «Capacitación en la plataforma» te dice quién hizo este recorrido y quién no, y te deja volvérselo a mandar a una persona o a todo el equipo.",
    ],
    roles: SOLO_DUENO,
  },
  {
    id: "cierre",
    ruta: "/dashboard",
    seccion: "Listo",
    titulo: "Eso es todo",
    texto:
      "Ya viste las secciones a las que tienes acceso y para qué sirve cada una. Lo que no está acá es porque tu rol no lo abre, no porque no exista.",
    puntos: [
      "El botón «Capacitación» del encabezado te trae este recorrido de vuelta cuando se te olvide algo.",
      "Si lo cierras por la mitad no se pierde: retomas en el paso donde ibas.",
    ],
    roles: CON_PIPELINE,
  },
];

/**
 * Los pasos que le tocan a una persona.
 *
 * A nadie se le explica una sección que no puede abrir: además de quedar mal,
 * el paso la llevaría a una pantalla que la rebota al panel y el recorrido se
 * cortaría solo.
 */
export function pasosParaUsuario({
  rol,
  vePayroll,
}: {
  rol: RolUsuario;
  vePayroll: boolean;
}): PasoCapacitacion[] {
  return PASOS.filter((paso) => {
    if (!paso.roles.includes(rol)) return false;
    if (paso.requierePermisoNomina && !vePayroll) return false;
    return true;
  });
}
