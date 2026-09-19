import { redirect } from "next/navigation";
import PushToggle from "../push-toggle";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentTotpCode, nextCodeExpiresAt, totpConfigured } from "@/lib/totp";
import ProfileScreen from "./profile-screen";
import SeguimientoActividad from "./seguimiento-actividad";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Administrador",
  DIRECTOR: "Director operativo",
  EDITOR: "Editor / Creador",
  PENDING: "Pendiente de rol",
};

export default async function MiPerfilPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      email: true,
      name: true,
      role: true,
      phone: true,
      birthDate: true,
      avatarUrl: true,
      employee: { select: { position: true } },
    },
  });
  if (!me) redirect("/login");

  // El código para crear usuarios solo lo ve quien puede crearlos. Se calcula
  // en el servidor en cada carga; nunca viaja el secreto que lo genera.
  const showCode = me.role === "OWNER" && totpConfigured();

  // El seguimiento de actividad del equipo: solo el administrador.
  const personas =
    me.role === "OWNER"
      ? await db.user.findMany({
          where: { organizationId: session.organizationId },
          select: { id: true, name: true, email: true, role: true },
          orderBy: { name: "asc" },
        })
      : null;
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guayaquil" }).format(new Date());

  return (
    <div className="flex flex-col gap-5">
      <ProfileScreen
      role={ROLE_LABEL[me.role] ?? me.role}
      position={me.employee?.position ?? null}
      email={me.email}
      profile={{
        name: me.name,
        phone: me.phone ?? "",
        birthDate: me.birthDate ? me.birthDate.toISOString().slice(0, 10) : "",
        avatarUrl: me.avatarUrl,
      }}
      creationCode={
        showCode
          ? {
              code: currentTotpCode() as string,
              // Instante exacto en que vence. Mandar un timestamp y no un
              // contador deja que la pantalla lo derive sin leer el reloj
              // durante el renderizado.
              expiresAt: nextCodeExpiresAt(),
            }
          : null
      }
      />

      {/* Los avisos push viven acá y no en el panel: es una preferencia de la
          persona, no algo del negocio. */}
      <PushToggle />

      {personas && <SeguimientoActividad personas={personas} hoy={hoy} />}
    </div>
  );
}
