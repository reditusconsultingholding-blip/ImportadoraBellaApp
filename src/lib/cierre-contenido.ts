import { db } from "@/lib/db";
import { diaDelReportePendiente } from "@/lib/reporte-horario";
import { resumenDelDia } from "@/lib/contenido";
import { avisarAVarios } from "@/lib/push";

// El cierre de día del módulo Contenido: al terminar el día (23:59 hora
// Ecuador, misma cuenta que el reporte diario), se le manda a los CEO un
// resumen de lo que hizo cada integrante — sin cifras de dinero, solo
// conteos: tareas, hechas, pendientes, por pautar, creativos.
//
// Se apoya en CierreSeguimiento @@unique([organizationId, fecha]): pasar por
// acá cada cinco minutos no manda el aviso de más.

export async function enviarCierreDeContenido(organizationId: string, forzar = false) {
  const dia = diaDelReportePendiente();

  if (!forzar) {
    const yaEsta = await db.cierreSeguimiento.findUnique({
      where: { organizationId_fecha: { organizationId, fecha: dia } },
      select: { id: true },
    });
    if (yaEsta) return null;
  }

  const resumen = await resumenDelDia(organizationId, dia);
  if (resumen.totalTareas === 0) return null;

  const detallePersonas = resumen.porPersona
    .map((p) => `${p.nombre}: ${p.hechas}/${p.tareas} hechas, ${p.creativos} creativos`)
    .join(" · ");
  const texto =
    `Cierre del ${dia.toISOString().slice(0, 10)}: ${resumen.totalTareas} tareas, ` +
    `${resumen.totalHechas} hechas, ${resumen.totalPendientes} pendientes, ` +
    `${resumen.totalPorPautar} por pautar. ${detallePersonas}`;

  // "Los CEO" en términos de datos: OWNER con permiso de finanzas — igual que
  // el reporte diario y el semanal.
  const ceos = await db.user.findMany({
    where: { organizationId, role: "OWNER", canViewFinancials: true },
    select: { id: true },
  });
  if (ceos.length === 0) return null;

  await Promise.all(
    ceos.map((u) =>
      db.notification.create({
        data: {
          userId: u.id,
          type: "cierre_dia",
          message: texto,
          link: "/dashboard/contenido?vista=tablero",
        },
      })
    )
  );
  await avisarAVarios(ceos.map((u) => u.id), {
    titulo: "Cierre del día — Contenido",
    cuerpo: `${resumen.totalHechas}/${resumen.totalTareas} tareas hechas, ${resumen.totalPorPautar} por pautar.`,
    url: "/dashboard/contenido?vista=tablero",
    etiqueta: "cierre-contenido",
  });

  await db.cierreSeguimiento.upsert({
    where: { organizationId_fecha: { organizationId, fecha: dia } },
    create: { organizationId, fecha: dia, resumen: texto },
    update: { resumen: texto },
  });

  return `cierre del ${dia.toISOString().slice(0, 10)}`;
}
