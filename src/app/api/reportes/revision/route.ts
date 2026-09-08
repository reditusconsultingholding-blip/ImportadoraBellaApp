import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { construirInformeDeRevision, nombreDelInformeDeRevision } from "@/lib/informe-revision";
import { veLasCifras } from "@/lib/finanzas";

// La lista de productos a revisar, en PDF.
//
// Es el mismo cálculo que /api/alertas —lo que el panel muestra en pantalla—
// servido como archivo. La diferencia no es de contenido sino de dónde se lee:
// la pantalla pide cuenta, contraseña y estar frente al panel; el PDF se manda
// por WhatsApp a quien tiene que apagar la campaña.
//
// Mismo permiso que la pantalla, por lo mismo: si alguien puede ver estas
// alertas en el panel, puede bajarlas; si no, tampoco.

export const maxDuration = 120;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  // A diferencia del informe de período, acá no se niega la descarga sin el
  // permiso de finanzas: se entrega la misma lista escrita sin montos. Qué
  // apagar es exactamente lo que el equipo creativo necesita saber, y negarle
  // el archivo entero por un CPA que igual se le puede tachar sería quitarle
  // la decisión para proteger la cifra.
  const verCifras = await veLasCifras(session.userId);
  const pdf = await construirInformeDeRevision(session.organizationId, verCifras);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreDelInformeDeRevision()}"`,
      "Cache-Control": "no-store",
    },
  });
}
