import { db } from "@/lib/db";
import { avisarA } from "@/lib/push";
import { emailConfigured, progresoHtml, sendEmail } from "@/lib/email";

// El progreso de cada persona, dos veces por mes: el 15 (del 1 al 15) y el
// último día (del 16 al fin de mes), a las 8 de la noche de Ecuador.
//
// Lo pidió dirección el 19 de septiembre de 2026: el aviso diario de las 8 va
// solo a don Fabricio y supervisión, y "los chicos podrán saber su progreso
// quincena y fin de mes". Llega dentro de la app, al celular (push) y por
// correo, y dice lo de cada uno y nada del resto del equipo.
//
// Va a quien tuvo tareas o piezas en el período y no es de dirección (dirección
// ya ve el avance todos los días). Sin cifras de dinero.

const HORA = 20;
const HORA_LIMITE = 23;
const FUENTE = "progreso-quincenal";
const TERMINADOS = new Set(["APROBADO", "REALIZADO", "EDITADO", "TESTEADO"]);
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** El día de Ecuador como marca UTC de medianoche (igual que TareaDiaria.fecha). */
function diaEcuador(ahora: Date) {
  const l = new Date(ahora.getTime() - 5 * 3600_000);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()));
}

export type Periodo = { clave: string; desde: Date; hasta: Date; texto: string };

/** El período que cierra `dia`, o null si ese día no cierra ninguno. */
export function periodoQueCierra(dia: Date): Periodo | null {
  const a = dia.getUTCFullYear();
  const m = dia.getUTCMonth();
  const d = dia.getUTCDate();
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  if (d === 15) {
    return { clave: `${a}-${m + 1}-1`, desde: new Date(Date.UTC(a, m, 1)), hasta: dia, texto: `1 al 15 de ${MESES[m]}` };
  }
  if (d === ultimo) {
    return {
      clave: `${a}-${m + 1}-2`,
      desde: new Date(Date.UTC(a, m, 16)),
      hasta: dia,
      texto: `16 al ${ultimo} de ${MESES[m]}`,
    };
  }
  return null;
}

/** El período anterior a uno dado, para la comparación. */
export function periodoAnterior(p: Periodo): { desde: Date; hasta: Date } {
  const a = p.desde.getUTCFullYear();
  const m = p.desde.getUTCMonth();
  if (p.desde.getUTCDate() === 16) return { desde: new Date(Date.UTC(a, m, 1)), hasta: new Date(Date.UTC(a, m, 15)) };
  return { desde: new Date(Date.UTC(a, m - 1, 16)), hasta: new Date(Date.UTC(a, m, 0)) };
}

type Cuenta = { tareas: number; cerradas: number; dias: Map<number, { total: number; cerradas: number }> };

async function tareasPorPersona(organizationId: string, desde: Date, hasta: Date) {
  const filas = await db.tareaDiaria.findMany({
    where: { organizationId, fecha: { gte: desde, lte: hasta }, ownerId: { not: null } },
    select: { ownerId: true, fecha: true, estado: true },
  });
  const porPersona = new Map<string, Cuenta>();
  for (const t of filas) {
    const c = porPersona.get(t.ownerId!) ?? { tareas: 0, cerradas: 0, dias: new Map() };
    const hecha = t.estado === "HECHO";
    c.tareas += 1;
    if (hecha) c.cerradas += 1;
    const k = t.fecha!.getTime();
    const d = c.dias.get(k) ?? { total: 0, cerradas: 0 };
    d.total += 1;
    if (hecha) d.cerradas += 1;
    c.dias.set(k, d);
    porPersona.set(t.ownerId!, c);
  }
  return porPersona;
}

export async function enviarProgresoQuincenal(organizationId: string, ahora = new Date()) {
  const hora = new Date(ahora.getTime() - 5 * 3600_000).getUTCHours();
  if (hora < HORA || hora > HORA_LIMITE) return null;
  const periodo = periodoQueCierra(diaEcuador(ahora));
  if (!periodo) return null;

  // Una vez por período.
  const estado = await db.syncState.findUnique({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    select: { detalle: true },
  });
  if (estado?.detalle === periodo.clave) return null;

  const anterior = periodoAnterior(periodo);
  const [actual, previo, piezas, personas] = await Promise.all([
    tareasPorPersona(organizationId, periodo.desde, periodo.hasta),
    tareasPorPersona(organizationId, anterior.desde, anterior.hasta),
    db.requirement.findMany({
      where: { organizationId, ownerId: { not: null }, dueDate: { gte: periodo.desde, lte: periodo.hasta } },
      select: { ownerId: true, status: true },
    }),
    db.user.findMany({
      where: { organizationId, role: { notIn: ["OWNER", "DIRECTOR"] } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const piezasDe = new Map<string, { total: number; cerradas: number }>();
  for (const p of piezas) {
    const c = piezasDe.get(p.ownerId!) ?? { total: 0, cerradas: 0 };
    c.total += 1;
    if (TERMINADOS.has(p.status)) c.cerradas += 1;
    piezasDe.set(p.ownerId!, c);
  }

  let avisados = 0;
  for (const u of personas) {
    const c = actual.get(u.id);
    const pz = piezasDe.get(u.id);
    if (!c && !pz) continue;

    const tareas = c?.tareas ?? 0;
    const cerradas = c?.cerradas ?? 0;
    const diasConTareas = c?.dias.size ?? 0;
    const diasCompletos = c ? [...c.dias.values()].filter((d) => d.cerradas === d.total).length : 0;
    const prev = previo.get(u.id);
    const cumplimientoAnterior = prev && prev.tareas > 0 ? Math.round((prev.cerradas / prev.tareas) * 100) : null;
    const pct = tareas > 0 ? Math.round((cerradas / tareas) * 100) : null;

    const mensaje =
      (pct != null
        ? `Del ${periodo.texto} cerraste ${cerradas} de ${tareas} tareas (${pct}%), con ${diasCompletos} de ${diasConTareas} días completos.`
        : `Del ${periodo.texto} no tuviste tareas en el día a día.`) +
      (pz ? ` Piezas entregadas: ${pz.cerradas} de ${pz.total}.` : "") +
      (pct != null && cumplimientoAnterior != null ? ` El período anterior: ${cumplimientoAnterior}%.` : "");
    const link = "/dashboard/contenido?vista=tablero";

    await db.notification.create({ data: { userId: u.id, type: "progreso_quincenal", message: mensaje, link } });
    await avisarA(u.id, { titulo: `Tu progreso · ${periodo.texto}`, cuerpo: mensaje, url: link, etiqueta: "progreso" });
    if (emailConfigured()) {
      await sendEmail({
        to: [u.email],
        subject: `Tu progreso del ${periodo.texto}`,
        html: progresoHtml({
          nombre: u.name.split(" ")[0],
          periodo: periodo.texto,
          tareas,
          cerradas,
          diasConTareas,
          diasCompletos,
          piezas: pz?.total ?? 0,
          piezasCerradas: pz?.cerradas ?? 0,
          cumplimientoAnterior,
        }),
      });
    }
    avisados += 1;
  }

  await db.syncState.upsert({
    where: { organizationId_fuente: { organizationId, fuente: FUENTE } },
    create: { organizationId, fuente: FUENTE, detalle: periodo.clave, okAt: new Date() },
    update: { detalle: periodo.clave, okAt: new Date(), error: null },
  });
  return `${periodo.texto}: ${avisados} personas`;
}
