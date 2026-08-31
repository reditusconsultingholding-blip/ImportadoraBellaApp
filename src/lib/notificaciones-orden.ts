// Los tres ejes con los que se ordena el centro de notificaciones: qué acción
// pide, qué tan urgente es y cuándo pasó.
//
// Antes la pantalla era una lista plana por fecha. Eso alcanzaba cuando el
// buzón traía cinco avisos al día; hoy caen ahí las alertas diarias, las de
// campaña, los reportes, las acciones por aprobar y el chat, y encontrar las
// dos que piden una decisión hoy significa leer cien líneas.
//
// El catálogo de tipos NO se inventa: son exactamente los valores que el
// código escribe hoy en Notification.type.
//
//   alert_escala        src/lib/alerts.ts, src/lib/alertas-diarias.ts
//   alert_fatiga        src/lib/alerts.ts, src/lib/alertas-diarias.ts
//   alert_discrepancia  src/lib/alerts.ts
//   daily_report        src/lib/daily-report.ts, src/lib/weekly-report.ts
//   asignacion          src/app/api/acciones/route.ts, src/lib/product-actions.ts
//   mention             registro, chat y menciones — y también el default del
//                       modelo, que es lo que termina teniendo el comentario
//                       de un requerimiento (no manda type).
//
// Cualquier otro valor cae en "Otras" en vez de desaparecer de la pantalla:
// una categoría que miente es peor que una que dice "no sé qué es esto".

import { resolveRange } from "@/lib/date-range";

export type NotificacionBase = {
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
};

// --- Eje 1: la acción que pide -------------------------------------------

export type CategoriaId = "alertas" | "acciones" | "reportes" | "chat" | "otras";

export type Categoria = {
  id: CategoriaId;
  label: string;
  ayuda: string;
  tipos: string[];
  /** Arranque de la frase del estado vacío: "Ninguna alerta de campaña…". */
  vacio: string;
  /** La misma categoría dentro de una frase: "…entre las alertas de campaña". */
  entre: string;
};

export const CATEGORIAS: Categoria[] = [
  {
    id: "alertas",
    label: "Alertas de campaña",
    ayuda: "Escalar, apagar, fatiga de creativo y datos que no cuadran",
    tipos: ["alert_escala", "alert_apagar", "alert_fatiga", "alert_discrepancia"],
    vacio: "Ninguna alerta de campaña",
    entre: "entre las alertas de campaña",
  },
  {
    id: "acciones",
    label: "Por aprobar y asignado",
    ayuda: "Propuestas esperando aprobación y trabajo asignado a alguien",
    tipos: ["asignacion"],
    vacio: "Ninguna acción por aprobar ni asignación",
    entre: "entre las acciones y asignaciones",
  },
  {
    id: "reportes",
    label: "Reportes",
    ayuda: "El reporte diario y el semanal de productos",
    tipos: ["daily_report"],
    vacio: "Ningún reporte",
    entre: "entre los reportes",
  },
  {
    id: "chat",
    label: "Chat y menciones",
    ayuda: "Mensajes directos, menciones y cuentas nuevas sin rol",
    tipos: ["mention"],
    vacio: "Ningún mensaje ni mención",
    entre: "entre los mensajes y menciones",
  },
  {
    id: "otras",
    label: "Otras",
    ayuda: "Tipos que todavía no tienen categoría propia",
    tipos: [],
    vacio: "Ninguna notificación de otro tipo",
    entre: "entre las otras notificaciones",
  },
];

const CATEGORIA_POR_TIPO = new Map<string, CategoriaId>(
  CATEGORIAS.flatMap((c) => c.tipos.map((t) => [t, c.id] as [string, CategoriaId]))
);

export function categoriaDe(tipo: string): CategoriaId {
  return CATEGORIA_POR_TIPO.get(tipo) ?? "otras";
}

export const categoriaPorId = (id: CategoriaId) =>
  CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1];

// --- Eje 2: urgencia ------------------------------------------------------
//
// El nivel no sale de una columna: en Notification no existe. Se deduce del
// tipo y del texto con un solo criterio: QUÉ PASA SI NADIE LO MIRA HOY.
//
//   Urgente     hay plata saliendo mientras el aviso está sin leer, o alguien
//               está parado esperando a quien lo lee. Una campaña marcada para
//               apagar sigue gastando; una propuesta sin aprobar deja a otra
//               persona sin poder avanzar.
//   Importante  cuesta plata, pero no en la próxima hora: una oportunidad de
//               escalar, un CPA que empezó a subir, números que no cuadran y
//               van a ensuciar la próxima decisión de presupuesto, trabajo ya
//               asignado.
//   Informativo conviene saberlo y no cambia nada de lo que se hace hoy.
//
// "apagar" ya tiene su propio type (alert_apagar). Aun asi se sigue mirando el
// prefijo del mensaje, porque las notificaciones guardadas antes de ese cambio
// quedaron en la base como alert_fatiga: sin leer el texto, una campana que
// quema plata seguiria apareciendo al nivel de un "vigilar esto".

export type NivelId = "urgente" | "importante" | "informativo";

export type Nivel = {
  id: NivelId;
  label: string;
  ayuda: string;
  /** Color Y palabra: el color solo no se lee de un vistazo ni se imprime. */
  chip: string;
  borde: string;
  /** Para frases: "Nada urgente en los últimos 7 días". */
  neutro: string;
};

export const NIVELES: Nivel[] = [
  {
    id: "urgente",
    label: "Urgente",
    ayuda: "Se está yendo plata o alguien espera una respuesta",
    chip: "bg-critical-bg text-critical",
    borde: "border-l-critical",
    neutro: "urgente",
  },
  {
    id: "importante",
    label: "Importante",
    ayuda: "Cuesta plata, pero no en la próxima hora",
    chip: "bg-surface-2 text-warning",
    borde: "border-l-warning",
    neutro: "importante",
  },
  {
    id: "informativo",
    label: "Informativo",
    ayuda: "Conviene saberlo, no cambia lo de hoy",
    chip: "bg-surface-2 text-muted",
    borde: "border-l-border",
    neutro: "informativo",
  },
];

export const nivelPorId = (id: NivelId) => NIVELES.find((n) => n.id === id) ?? NIVELES[2];

const PIDE_APAGAR = /^apagar\s/i;
const SOLO_VIGILAR = /^vigilar\s/i;
// "esperando aprobación" (acciones) y "esperando que le asignes un rol"
// (registro): las dos frases dejan a alguien detenido del otro lado.
const ALGUIEN_ESPERA = /esperando (que|aprobaci[oó]n)/i;

export function nivelDe(n: { type: string; message: string }): NivelId {
  // "apagar" tiene su propio type desde que se lo dimos en alertas-diarias.ts.
  // El resto de esta funcion sigue mirando el texto por las notificaciones que
  // se guardaron ANTES de ese cambio: ya estan en la base con el type viejo y
  // seguirian apareciendo como simple fatiga.
  if (n.type === "alert_apagar") return "urgente";
  if (PIDE_APAGAR.test(n.message) || ALGUIEN_ESPERA.test(n.message)) return "urgente";
  if (SOLO_VIGILAR.test(n.message)) return "informativo";

  switch (n.type) {
    case "alert_escala":
    case "alert_fatiga":
    case "alert_discrepancia":
    case "asignacion":
      return "importante";
    default:
      return "informativo";
  }
}

// La etiqueta de la fila sale del mensaje cuando el mensaje sabe más que el
// type — que es el caso de las alertas diarias, donde "Apagar", "Escalar" y
// "Vigilar" comparten dos types nada más.
const ETIQUETA_POR_TIPO: Record<string, string> = {
  alert_escala: "Escalar",
  alert_apagar: "Apagar",
  alert_fatiga: "Fatiga de anuncio",
  alert_discrepancia: "Discrepancia de datos",
  daily_report: "Reporte",
  asignacion: "Acción",
  mention: "Mención",
};

export function etiquetaDe(n: { type: string; message: string }): string {
  if (PIDE_APAGAR.test(n.message)) return "Apagar";
  if (SOLO_VIGILAR.test(n.message)) return "Vigilar";
  if (/^escalar\s/i.test(n.message)) return "Escalar";
  return ETIQUETA_POR_TIPO[n.type] ?? n.type;
}

// --- Eje 3: período -------------------------------------------------------
//
// El servidor corre en UTC y el negocio es de Ecuador (UTC-5). "Hoy" no puede
// ser la medianoche UTC ni "las últimas 24 horas": lo primero corre el corte
// cinco horas —de 19:00 a medianoche en Guayaquil ya es el día siguiente en
// UTC— y lo segundo hace que el corte se mueva mientras miras la pantalla.
// date-range.ts ya resuelve esa distinción para el panel, así que el arranque
// del día ecuatoriano se toma de ahí en vez de repetir el offset.
//
// Semana, quincena y mes son ventanas MÓVILES, no casillas de calendario: el
// día 1 "este mes" mostraría casi nada, y quien entra a notificaciones quiere
// ver lo reciente, no lo que cabe en el mes.

export type PeriodoId = "dia" | "semana" | "quincena" | "mes";

export type Periodo = {
  id: PeriodoId;
  label: string;
  dias: number;
  ayuda: string;
  /** Cola de la frase del estado vacío. */
  frase: string;
};

export const PERIODOS: Periodo[] = [
  { id: "dia", label: "Día", dias: 1, ayuda: "Desde la medianoche de hoy en Ecuador", frase: "de hoy" },
  { id: "semana", label: "Semana", dias: 7, ayuda: "Los últimos 7 días", frase: "en los últimos 7 días" },
  { id: "quincena", label: "Quincena", dias: 15, ayuda: "Los últimos 15 días", frase: "en los últimos 15 días" },
  { id: "mes", label: "Mes", dias: 30, ayuda: "Los últimos 30 días", frase: "en los últimos 30 días" },
];

export const periodoPorId = (id: PeriodoId) => PERIODOS.find((p) => p.id === id) ?? PERIODOS[1];

export type LimitesPeriodo = Record<PeriodoId, string>;

/**
 * Instante en que arranca cada período, en ISO.
 *
 * Se calcula una sola vez en el servidor y viaja por props: si el cliente lo
 * recalculara en cada render, el corte se movería solo al cruzar la medianoche
 * con la pestaña abierta y "mostrando N de M" cambiaría sin que nadie tocara
 * nada.
 */
export function limitesDePeriodos(): LimitesPeriodo {
  const arranqueDeHoy = resolveRange("hoy").fromInstant.getTime();
  const unDia = 24 * 3600_000;
  const desde = (dias: number) => new Date(arranqueDeHoy - (dias - 1) * unDia).toISOString();

  return {
    dia: desde(1),
    semana: desde(7),
    quincena: desde(15),
    mes: desde(30),
  };
}

// --- Cruce de filtros -----------------------------------------------------
//
// Los cuatro se combinan siempre con Y y en el mismo orden: período,
// categoría, nivel, sin leer. Es lo que hace que "mostrando N de M" signifique
// lo mismo sin importar en qué orden se hayan tocado los botones.

export type FiltroNotificaciones = {
  categoria: CategoriaId | "todas";
  nivel: NivelId | "todos";
  periodo: PeriodoId;
  soloSinLeer: boolean;
};

export const FILTRO_INICIAL: FiltroNotificaciones = {
  categoria: "todas",
  nivel: "todos",
  periodo: "semana",
  soloSinLeer: false,
};

function pasa(n: NotificacionBase, filtro: Partial<FiltroNotificaciones>, limites: LimitesPeriodo) {
  if (filtro.periodo && n.createdAt < limites[filtro.periodo]) return false;
  if (filtro.categoria && filtro.categoria !== "todas" && categoriaDe(n.type) !== filtro.categoria) return false;
  if (filtro.nivel && filtro.nivel !== "todos" && nivelDe(n) !== filtro.nivel) return false;
  if (filtro.soloSinLeer && n.read) return false;
  return true;
}

export function filtrar<T extends NotificacionBase>(
  items: T[],
  filtro: FiltroNotificaciones,
  limites: LimitesPeriodo
): T[] {
  return items.filter((n) => pasa(n, filtro, limites));
}

// Los contadores de cada botón se calculan con todos los demás filtros puestos
// menos el suyo: así el número que se ve es el que se va a obtener al tocarlo,
// y no quedan chips que prometen 12 y devuelven 0.
export function contarPorCategoria(
  items: NotificacionBase[],
  filtro: FiltroNotificaciones,
  limites: LimitesPeriodo
): Record<CategoriaId | "todas", number> {
  const cuenta: Record<CategoriaId | "todas", number> = {
    todas: 0,
    alertas: 0,
    acciones: 0,
    reportes: 0,
    chat: 0,
    otras: 0,
  };
  for (const n of items) {
    if (!pasa(n, { periodo: filtro.periodo, nivel: filtro.nivel, soloSinLeer: filtro.soloSinLeer }, limites)) continue;
    cuenta.todas++;
    cuenta[categoriaDe(n.type)]++;
  }
  return cuenta;
}

export function contarPorNivel(
  items: NotificacionBase[],
  filtro: FiltroNotificaciones,
  limites: LimitesPeriodo
): Record<NivelId | "todos", number> {
  const cuenta: Record<NivelId | "todos", number> = {
    todos: 0,
    urgente: 0,
    importante: 0,
    informativo: 0,
  };
  for (const n of items) {
    if (
      !pasa(n, { periodo: filtro.periodo, categoria: filtro.categoria, soloSinLeer: filtro.soloSinLeer }, limites)
    ) {
      continue;
    }
    cuenta.todos++;
    cuenta[nivelDe(n)]++;
  }
  return cuenta;
}

/** Las notificaciones ya filtradas, repartidas por urgencia y en orden. */
export function agruparPorNivel<T extends NotificacionBase>(items: T[]) {
  return NIVELES.map((nivel) => ({
    nivel,
    items: items.filter((n) => nivelDe(n) === nivel.id),
  })).filter((g) => g.items.length > 0);
}

/**
 * Qué decir cuando el cruce de filtros no deja nada.
 *
 * La frase nombra los filtros puestos —incluido el nivel— porque "no hay
 * notificaciones" a secas es mentira cuando sí las hay y lo que falta son las
 * urgentes de esta semana.
 */
export function textoVacio(filtro: FiltroNotificaciones): string {
  const periodo = periodoPorId(filtro.periodo).frase;
  const sinLeer = filtro.soloSinLeer ? " sin leer" : "";

  if (filtro.nivel !== "todos") {
    const nada = `Nada ${nivelPorId(filtro.nivel).neutro}${sinLeer}`;
    return filtro.categoria === "todas"
      ? `${nada} ${periodo}.`
      : `${nada} ${categoriaPorId(filtro.categoria).entre} ${periodo}.`;
  }

  const cabeza = filtro.categoria === "todas" ? "Ninguna notificación" : categoriaPorId(filtro.categoria).vacio;
  return `${cabeza}${sinLeer} ${periodo}.`;
}
