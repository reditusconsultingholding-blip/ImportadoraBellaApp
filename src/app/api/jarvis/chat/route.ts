import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatWithJarvis, type ChatTurn } from "@/lib/agent";
import { guardarTurno } from "@/lib/jarvis-chats";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { history, conversacionId } = (await req.json()) as {
    history: ChatTurn[];
    conversacionId?: string | null;
  };
  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  try {
    const result = await chatWithJarvis(session.organizationId, history);

    // La conversación se guarda después de responder, no antes: si Jarvis
    // falla, no queda una conversación a medias con una pregunta sin respuesta.
    const pregunta = [...history].reverse().find((h) => h.role === "user")?.content ?? "";
    const id = await guardarTurno({
      organizationId: session.organizationId,
      userId: session.userId,
      conversacionId: conversacionId ?? null,
      pregunta,
      respuesta: result.reply,
    });

    return NextResponse.json({ ...result, conversacionId: id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 }
    );
  }
}
