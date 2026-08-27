import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

// El permiso de nómina se lee de la base en cada pedido, no del JWT: si a
// alguien se le quita el acceso al pago, deja de verlo al instante en vez de
// esperar a que se le venza la sesión de 30 días.
export async function getPayrollViewer(): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { canViewPayroll: true, organizationId: true },
  });
  if (!user?.canViewPayroll) return null;
  if (user.organizationId !== session.organizationId) return null;

  return session;
}
