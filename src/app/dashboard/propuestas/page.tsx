import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessPipeline, canManagePipeline, canUseJarvis } from "@/lib/permissions";
import { db } from "@/lib/db";
import { EncabezadoSeccion } from "../encabezado-seccion";
import ListaPropuestas, { type FilaPropuesta } from "./lista-propuestas";

// «Propuestas y dudas»: lo que el equipo manda desde la burbuja de ayuda.
// Dirección ve todas y responde; el resto ve las suyas con la respuesta.
export default async function PropuestasPage({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");
  const { abrir } = await searchParams;

  const direccion = canManagePipeline(session.role);
  const filas = await db.propuestaEquipo.findMany({
    where: { organizationId: session.organizationId, ...(direccion ? {} : { userId: session.userId }) },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const ids = [...new Set(filas.flatMap((p) => [p.userId, p.respondidoPor].filter(Boolean) as string[]))];
  const gente = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nombre = new Map(gente.map((u) => [u.id, u.name]));

  const propuestas: FilaPropuesta[] = filas.map((p) => ({
    id: p.id,
    tipo: p.tipo,
    texto: p.texto,
    dictado: p.dictado,
    ruta: p.ruta,
    seccion: p.seccion,
    estado: p.estado,
    respuesta: p.respuesta,
    autor: nombre.get(p.userId) ?? "Alguien del equipo",
    respondio: p.respondidoPor ? (nombre.get(p.respondidoPor) ?? null) : null,
    respondidoEn: p.respondidoEn?.toISOString() ?? null,
    creada: p.createdAt.toISOString(),
    mia: p.userId === session.userId,
  }));

  return (
    <div className="flex flex-col gap-5">
      <EncabezadoSeccion
        eyebrow="Equipo"
        titulo="Propuestas y dudas"
        descripcion={
          direccion
            ? "Lo que el equipo propone, pregunta o reporta desde el botón «Ayuda», dictado con la voz o escrito. Márcalo y respóndele: la respuesta le llega a quien lo mandó."
            : "Lo que mandaste desde el botón «Ayuda», con lo que te respondió dirección. Para mandar algo nuevo, toca «Ayuda» abajo a la derecha y luego «Proponer una mejora o avisar algo»."
        }
      />
      <ListaPropuestas inicial={propuestas} direccion={direccion} abrir={abrir ?? null} puedeJarvis={canUseJarvis(session.role)} />
    </div>
  );
}
