import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canUseJarvis } from "@/lib/permissions";
import { db } from "@/lib/db";
import { chatWithJarvis, type ChatTurn } from "@/lib/agent";
import { guardarTurno } from "@/lib/jarvis-chats";
import { frenarUsuario } from "@/lib/limite";
import { mensajeSeguro } from "@/lib/respuesta";
import { revisarImagenes } from "@/lib/imagenes-chat";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Cada mensaje es una llamada paga a la IA.
  const frenado = frenarUsuario("jarvis-chat", session.userId, 30, 10 * 60 * 1000);
  if (frenado) return frenado;
  if (!canUseJarvis(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { history, conversacionId } = (await req.json()) as {
    history: ChatTurn[];
    conversacionId?: string | null;
  };
  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  const malaImagen = revisarImagenes(history);
  if (malaImagen) return NextResponse.json({ error: malaImagen }, { status: 400 });

  // El permiso se lee de la base y no de la sesion: la sesion es un token
  // firmado que dura 30 dias, asi que quitarle el acceso a alguien no
  // tendria efecto hasta que vuelva a entrar.
  const me = await db.user.findUnique({
    where: { id: session.userId },
    select: { canViewFinancials: true },
  });

  /**
   * La respuesta viaja por pedazos, una línea de JSON por evento.
   *
   * Antes esto era un `await` y un `NextResponse.json`: la ruta esperaba la
   * respuesta COMPLETA —incluidas hasta seis consultas a la base con una vuelta
   * al modelo cada una— y recién entonces mandaba algo. El dueño veía "Jarvis
   * está pensando…" todo ese tiempo y escribió "demora demasiado en responder".
   * Buena parte de esa demora no era el modelo: era que lo que ya estaba escrito
   * se guardaba hasta el final.
   *
   * Se eligió NDJSON y no server-sent events porque acá no hace falta
   * reconexión ni ids de evento: alcanza con leer líneas. Una línea, un evento.
   */
  const encoder = new TextEncoder();
  const pregunta = [...history].reverse().find((h) => h.role === "user")?.content ?? "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const mandar = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        for await (const ev of chatWithJarvis(
          session.organizationId,
          history,
          me?.canViewFinancials === true
        )) {
          if (ev.tipo !== "fin") {
            mandar(ev);
            continue;
          }

          // La conversación se guarda después de responder, no antes: si Jarvis
          // falla, no queda una conversación a medias con una pregunta sin
          // respuesta.
          //
          // Que falle el guardado no debe borrar una respuesta que ya está en
          // pantalla: se sigue sin el id y ese turno no queda en el historial,
          // que es mucho menos grave que perder la respuesta.
          let id: string | null = null;
          try {
            id = await guardarTurno({
              organizationId: session.organizationId,
              userId: session.userId,
              conversacionId: conversacionId ?? null,
              pregunta,
              respuesta: ev.reply,
            });
          } catch {
            id = null;
          }

          mandar({ ...ev, conversacionId: id });
        }
      } catch (err) {
        // El error va DENTRO del flujo. A esta altura ya salieron las cabeceras
        // con estado 200, así que no hay forma de devolver un 500: si no se
        // avisa por acá, la pantalla se queda esperando para siempre.
        mandar({ tipo: "error", error: mensajeSeguro(err, "Error inesperado.") });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Sin esto, un proxy que junta la respuesta para comprimirla la retiene
      // hasta el final y deshace todo el trabajo de arriba.
      "X-Accel-Buffering": "no",
    },
  });
}
