import { db } from "@/lib/db";
import { avisarA } from "@/lib/push";

// El aviso de las ocho: a cada persona, lo suyo.
//
// POR QUÉ NO ALCANZABA CON EL CIERRE DE DÍA QUE YA EXISTÍA
// Aquel se manda a las 23:59 y va a los dueños, con el resumen de todo el
// equipo. Sirve para mirar el día terminado, no para salvarlo. Lo que se pidió
// es otra cosa: "a las ocho de la noche, que le llegue a cada celular cuántas
// de sus actividades del día quedaron pendientes". A las ocho todavía hay
// tiempo de cerrar dos tareas; a las 23:59 el día ya pasó.
//
// Por eso este aviso es personal: cada quien recibe su propio conteo y nada
// más. Un mensaje que dice "quedan 14 pendientes en el equipo" no hace que
// nadie haga nada, porque no dice cuáles son de uno.

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

/** El día calendario de Ecuador como marca UTC de medianoche. */
function diaEcuador(ahora = new Date()) {
  const local = new Date(ahora.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

function horaEcuador(ahora = new Date()) {
  return new Date(ahora.getTime() - 5 * 3600_000).getUTCHours();
}

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
  const porPersona = new Map<string, { nombre: string; total: number; pendientes: string[] }>();
  let sinDuenoPendientes = 0;

  for (const t of tareas) {
    const pendiente = t.estado !== "HECHO";
    if (!t.ownerId || !t.owner) {
      if (pendiente) sinDuenoPendientes += 1;
      continue;
    }
    const actual = porPersona.get(t.ownerId) ?? {
      nombre: t.owner.name,
      total: 0,
      pendientes: [],
    };
    actual.total += 1;
    if (pendiente) actual.pendientes.push(t.product?.name ?? t.productoTexto ?? "sin producto");
    porPersona.set(t.ownerId, actual);
  }

  let avisados = 0;
  for (const [userId, p] of porPersona) {
    // A quien terminó todo no se le manda nada. Un aviso que llega igual todos
    // los días —diga lo que diga— deja de leerse, y entonces tampoco se lee el
    // día que sí había algo pendiente.
    if (p.pendientes.length === 0) continue;

    const cuantas = p.pendientes.length;
    const lista = [...new Set(p.pendientes)].slice(0, 4).join(", ");
    const mensaje =
      `Te quedan ${cuantas} de ${p.total} ${p.total === 1 ? "tarea" : "tareas"} del día sin cerrar` +
      (lista ? `: ${lista}${new Set(p.pendientes).size > 4 ? "…" : ""}` : ".");

    await db.notification.create({
      data: {
        userId,
        type: "pendientes_dia",
        message: mensaje,
        link: "/dashboard/contenido?vista=tablero",
      },
    });
    await avisarA(userId, {
      titulo: `${cuantas} ${cuantas === 1 ? "tarea" : "tareas"} sin cerrar`,
      cuerpo: mensaje,
      url: "/dashboard/contenido?vista=tablero",
      etiqueta: "pendientes-dia",
    });
    avisados += 1;
  }

  // Y a la dirección, el panorama: cuántas quedan en total y cuántas no tienen
  // responsable, que son las que se pierden en silencio.
  const totalPendientes =
    [...porPersona.values()].reduce((s, p) => s + p.pendientes.length, 0) + sinDuenoPendientes;

  if (totalPendientes > 0) {
    const direccion = await db.user.findMany({
      where: { organizationId, role: { in: ["OWNER", "DIRECTOR"] } },
      select: { id: true },
    });
    const texto =
      `Quedan ${totalPendientes} de ${tareas.length} tareas del día sin cerrar` +
      (sinDuenoPendientes > 0 ? `, ${sinDuenoPendientes} sin responsable asignado.` : ".");
    for (const u of direccion) {
      await db.notification.create({
        data: {
          userId: u.id,
          type: "pendientes_dia",
          message: texto,
          link: "/dashboard/contenido?vista=tablero",
        },
      });
    }
  }

  const detalle = `${avisados} personas avisadas, ${totalPendientes} pendientes`;
  await marcar(detalle);
  return detalle;
}
