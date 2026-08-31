import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canUseJarvis } from "@/lib/permissions";
import { listarConversaciones } from "@/lib/jarvis-chats";
import JarvisChat from "./jarvis-chat";

export default async function JarvisPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  // Jarvis consulta la base entera: facturacion, utilidad, costos, clientes.
  // Es la pantalla que mas datos expone y no miraba el rol.
  if (!canUseJarvis(session.role)) redirect("/dashboard");

  // La lista se trae en el servidor y no al montar el componente: así la
  // pantalla ya llega con las conversaciones puestas, sin un parpadeo vacío.
  const conversaciones = await listarConversaciones(session.userId);

  return (
    <div className="flex h-[calc(100vh-160px)] flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Jarvis</h1>
        <p className="text-sm text-muted">
          Preguntale por el rendimiento de tus campañas. Consulta la base de la empresa para
          responder, y cualquier acción que proponga queda esperando tu aprobación — nunca se
          ejecuta sola.
        </p>
      </div>
      <JarvisChat
        inicial={conversaciones.map((c) => ({
          id: c.id,
          titulo: c.titulo,
          updatedAt: c.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
