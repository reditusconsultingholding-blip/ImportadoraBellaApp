import { db } from "@/lib/db";
import { avisarA } from "@/lib/push";

// El aviso de las ocho: a cada persona lo suyo, y a la dirección el panorama.
//
// POR QUÉ NO ALCANZABA CON EL CIERRE DE DÍA QUE YA EXISTÍA
// Aquel se manda a las 23:59 y va a los dueños, con el resumen de todo el
// equipo. Sirve para mirar el día terminado, no para salvarlo. Lo que se pidió
// es otra cosa: "a las ocho de la noche, que le llegue a cada celular cuántas
// de sus actividades del día quedaron pendientes". A las ocho todavía hay
// tiempo de cerrar dos tareas; a las 23:59 el día ya pasó.
//
// QUÉ RECIBE CADA QUIEN
// Cada persona: lo que cerró y lo que le queda, de lo suyo y nada más. Un
// mensaje que dice "quedan 14 pendientes en el equipo" no hace que nadie haga
// nada, porque no dice cuáles son de uno.
//
// La dirección —Fabricio, Emilia y quien tenga rol de dueño o director—
// recibe el avance: cuánto cerró el equipo, quién va con cuánto pendiente y
// cuántas tareas no tienen responsable. Esas últimas son las que se pierden
// en silencio, porque no hay a quién preguntarle por ellas.
//
// El aviso personal se manda también a quien terminó todo. Cuesta un mensaje
// al día y es la única forma de que llegue a significar algo: si solo llegara
// habiendo pendientes, no recibirlo sería ambiguo —pudo no haber nada, o pudo
// fallar el reloj—. Llegando siempre, el silencio sí es una señal.

/** Hora de Ecuador a la que se manda. */
const HORA = 20;

/**
 * Hasta qué hora sigue siendo válido mandarlo.
 *
 * El reloj pasa cada cinco minutos, así que normalmente sale a las 20:00 en
 * punto. La ventana existe para el día en que el servicio estuvo caído a esa
 * hora: si vuelve a las 21:30, el aviso todavía sirve. Pasada la medianoche
 * no, y por eso no se manda.
 */
const HORA_LIMITE = 23;

const FUENTE = "pendientes-del-dia";

/** Cuántos nombres de producto se enumeran antes de cortar con puntos. */
const TOPE_LISTA = 4;

/** Cuántas personas se enumeran en el resumen de dirección. */
const TOPE_PERSONAS = 6;

/** El día calendario de Ecuador como marca UTC de medianoche. */
function diaEcuador(ahora = new Date()) {
  const local = new Date(ahora.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

function horaEcuador(ahora = new Date()) {
  return new Date(ahora.getTime() - 5 * 3600_000).getUTCHours();
}

function segun(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios;
}

type Persona = {
  nombre: string;
  total: number;
  cerradas: number;
  pendientes: string[];
};

export async function avisarPendientesDelDia(organizationId: string) {
  const ahora = new Date();
  const hora = horaEcuador(ahora);
  if (hora < HORA || hora > HORA_LIMITE) return null;

  const dia = diaEcuador(ahora);

  // Una vez por día. Se compara contra el día ecuatoriano y no contra "hace 20
  // horas": con el umbral por horas, un aviso mandado a las 21:30 de un día
  // bloqueaba el de las 20:00 del siguiente.
  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    select: { okAt: true },
  });
  if (estado?.okAt && diaEcuador(estado.okAt).getTime() === dia.getTime()) return null;

  const tareas = await db.tareaDiaria.findMany({
    where: { organizationId, fecha: dia },
    select: {
      estado: true,
      ownerId: true,
      owner: { select: { id: true, name: true } },
      product: { select: { name: true } },
      productoTexto: true,
    },
  });

  const marcar = (detalle: string) =>
    db.syncState.upsert({
      where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
      create: { organizationId, fuente: FUENTE, okAt: new Date(), detalle },
      update: { okAt: new Date(), detalle, error: null },
    });

  if (tareas.length === 0) {
    // Se marca igual: sin tareas cargadas no hay nada que avisar, y no hay que
    // volver a mirarlo en cinco minutos.
    await marcar("sin tareas cargadas");
    return null;
  }

  // Agrupadas por responsable. Las que no tienen dueño se cuentan aparte: no
  // se le pueden reclamar a nadie, pero tampoco pueden desaparecer.
  const porPersona = new Map<string, Persona>();
  let sinDuenoPendientes = 0;
  let sinDuenoTotal = 0;

  for (const t of tareas) {
    const pendiente = t.estado !== "HECHO";
    if (!t.ownerId || !t.owner) {
      sinDuenoTotal += 1;
      if (pendiente) sinDuenoPendientes += 1;
      continue;
    }
    const actual = porPersona.get(t.ownerId) ?? {
      nombre: t.owner.name,
      total: 0,
      cerradas: 0,
      pendientes: [],
    };
    actual.total += 1;
    if (pendiente) actual.pendientes.push(t.product?.name ?? t.productoTexto ?? "sin producto");
    else actual.cerradas += 1;
    porPersona.set(t.ownerId, actual);
  }

  let avisados = 0;
  for (const [userId, p] of porPersona) {
    const quedan = p.pendientes.length;
    const distintos = [...new Set(p.pendientes)];
    const lista = distintos.slice(0, TOPE_LISTA).join(", ");

    const mensaje =
      quedan === 0
        ? `Cerraste ${p.total === 1 ? "la única tarea" : `las ${p.total} tareas`} del día. ` +
          "No te queda nada pendiente."
        : `Cerraste ${p.cerradas} de ${p.total}. Te ${segun(quedan, "queda", "quedan")} ${quedan} ` +
          "sin cerrar" +
          (lista ? `: ${lista}${distintos.length > TOPE_LISTA ? "…" : "."}` : ".");

    await db.notification.create({
      data: {
        userId,
        type: "pendientes_dia",
        message: mensaje,
        link: "/dashboard/contenido?vista=tablero",
      },
    });
    await avisarA(userId, {
      titulo:
        quedan === 0 ? "Día cerrado" : `${quedan} ${segun(quedan, "tarea", "tareas")} sin cerrar`,
      cuerpo: mensaje,
      url: "/dashboard/contenido?vista=tablero",
      etiqueta: "pendientes-dia",
    });
    avisados += 1;
  }

  // Y a la dirección, el avance del día: cuánto se cerró, quién va con qué y
  // cuántas quedaron sin responsable.
  const totalPendientes =
    [...porPersona.values()].reduce((s, p) => s + p.pendientes.length, 0) + sinDuenoPendientes;
  const totalCerradas = tareas.length - totalPendientes;

  // Ordenado por lo que falta y no alfabético: quien más deba queda arriba,
  // que es a quien hay que escribirle antes de que termine el día.
  const conPendientes = [...porPersona.values()]
    .filter((p) => p.pendientes.length > 0)
    .sort((a, b) => b.pendientes.length - a.pendientes.length);

  const cerraronTodo = [...porPersona.values()].filter((p) => p.pendientes.length === 0);
  const nombre = (p: Persona) => p.nombre.split(" ")[0];

  const renglones: string[] = [
    `Cerradas ${totalCerradas} de ${tareas.length} ${segun(tareas.length, "tarea", "tareas")} del día.`,
  ];

  if (conPendientes.length > 0) {
    const detalle = conPendientes
      .slice(0, TOPE_PERSONAS)
      .map((p) => `${nombre(p)} ${p.pendientes.length}`)
      .join(", ");
    const resto = conPendientes.length - TOPE_PERSONAS;
    renglones.push(`Pendientes: ${detalle}${resto > 0 ? `, y ${resto} más` : ""}.`);
  }

  if (cerraronTodo.length > 0) {
    renglones.push(`Al día: ${cerraronTodo.map(nombre).join(", ")}.`);
  }

  if (sinDuenoPendientes > 0) {
    renglones.push(
      `${sinDuenoPendientes} ${segun(sinDuenoPendientes, "tarea", "tareas")} sin responsable ` +
        `${segun(sinDuenoPendientes, "sigue", "siguen")} sin cerrar.`,
    );
  } else if (sinDuenoTotal > 0) {
    renglones.push(
      `${sinDuenoTotal === 1 ? "La tarea" : `Las ${sinDuenoTotal} tareas`} sin responsable ` +
        `${segun(sinDuenoTotal, "quedó cerrada", "quedaron cerradas")}.`,
    );
  }

  const texto = renglones.join(" ");

  const direccion = await db.user.findMany({
    where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
    select: { id: true },
  });

  for (const u of direccion) {
    await db.notification.create({
      data: {
        userId: u.id,
        type: "pendientes_dia",
        message: texto,
        link: "/dashboard/contenido?vista=tablero",
      },
    });
    await avisarA(u.id, {
      titulo: `Avance del día · ${totalCerradas} de ${tareas.length}`,
      cuerpo: texto,
      url: "/dashboard/contenido?vista=tablero",
      etiqueta: "avance-dia",
    });
  }

  const detalle =
    `${avisados} personas avisadas, ${direccion.length} en dirección, ` +
    `${totalCerradas} cerradas y ${totalPendientes} pendientes`;
  await marcar(detalle);
  return detalle;
}
