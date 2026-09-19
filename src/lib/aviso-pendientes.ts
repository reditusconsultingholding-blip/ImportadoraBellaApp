import { db } from "@/lib/db";
import { avisarA } from "@/lib/push";

// El aviso de las ocho: el avance del día, SOLO para dirección.
//
// Desde el 19 de septiembre de 2026 no le llega a cada persona: dirección
// pidió que lo reciban don Fabricio y supervisión, y que el equipo vea su
// progreso en quincena y fin de mes (src/lib/progreso-quincenal.ts). Lo de
// abajo explica por qué nació como estaba; se conserva como historia.
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

  const anomalias = await piezasSinClasificar(organizationId, dia);

  if (tareas.length === 0 && anomalias.porProducto.length === 0) {
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

  // Solo a dirección (Fabricio y supervisión). Hasta el 19 de septiembre de
  // 2026 también le llegaba a cada persona su propio resumen; dirección pidió
  // que no: el equipo ve su progreso en el resumen de quincena y de fin de mes
  // (ver src/lib/progreso-quincenal.ts).
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

  const renglones: string[] = tareas.length
    ? [`Cerradas ${totalCerradas} de ${tareas.length} ${segun(tareas.length, "tarea", "tareas")} del día.`]
    : [];

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

  // La anomalía que pidió Emilia: piezas de hoy que los responsables no
  // clasificaron. Va con el nombre del producto y de quién lo lleva, para que
  // se sepa a quién escribirle sin abrir nada.
  if (anomalias.porProducto.length) {
    const detalle = anomalias.porProducto
      .slice(0, TOPE_PERSONAS)
      .map((x) => `${x.producto} ${x.n}${x.responsables.length ? ` (${x.responsables.join(", ")})` : ""}`)
      .join(", ");
    renglones.push(`Piezas sin clasificar: ${detalle}.`);
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
      titulo: tareas.length ? `Avance del día · ${totalCerradas} de ${tareas.length}` : "Piezas sin clasificar",
      cuerpo: texto,
      url: "/dashboard/contenido?vista=tablero",
      etiqueta: "avance-dia",
    });
  }

  const detalle =
    `Solo dirección: ${direccion.length} avisados, ` +
    `${totalCerradas} cerradas y ${totalPendientes} pendientes`;
  await marcar(detalle);
  return detalle;
}

/**
 * Las piezas cargadas hoy a las que les falta clasificación.
 *
 * Una pieza se puede crear escribiendo solo su nombre —así se suben rápido las
 * cinco del día— y completar el resto en la fila. Si a la noche sigue sin
 * formato, ángulo o awareness, la regla de diversidad no se puede revisar y la
 * pieza no sirve para aprender nada de ella. Se le reclama a quienes llevan el
 * producto; si el producto no tiene responsables, a quien tiene la pieza.
 */
async function piezasSinClasificar(organizationId: string, dia: Date) {
  const inicio = new Date(dia.getTime() + 5 * 3600_000);
  const fin = new Date(inicio.getTime() + 86400_000);
  const piezas = await db.requirement.findMany({
    where: {
      organizationId,
      date: { gte: inicio, lt: fin },
      OR: [
        { adType: "" },
        { phase: "" },
        { visualFormat: "" },
        { angle: "" },
        { awarenessLevel: "" },
        { marketOrigin: "" },
      ],
    },
    select: {
      productId: true,
      ownerId: true,
      product: {
        select: {
          name: true,
          responsables: { select: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const porProductoMapa = new Map<string, { producto: string; n: number; responsables: string[]; ids: string[] }>();
  for (const p of piezas) {
    const clave = p.productId ?? "__sin__";
    const a = porProductoMapa.get(clave) ?? {
      producto: p.product?.name ?? "sin producto",
      n: 0,
      responsables: (p.product?.responsables ?? []).map((r) => r.user.name.split(" ")[0]),
      ids: (p.product?.responsables ?? []).map((r) => r.user.id),
    };
    a.n += 1;
    // Sin responsables del producto, se le reclama a quien tiene la pieza.
    if (a.ids.length === 0 && p.ownerId && !a.ids.includes(p.ownerId)) a.ids.push(p.ownerId);
    porProductoMapa.set(clave, a);
  }

  const porProducto = [...porProductoMapa.values()].sort((a, b) => b.n - a.n);
  const porPersona = new Map<string, { producto: string; n: number }[]>();
  for (const x of porProducto) {
    for (const id of x.ids) {
      const l = porPersona.get(id) ?? [];
      l.push({ producto: x.producto, n: x.n });
      porPersona.set(id, l);
    }
  }
  return { porProducto, porPersona };
}
