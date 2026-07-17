import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatWithJarvis, type ChatTurn } from "@/lib/agent";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { history } = (await req.json()) as { history: ChatTurn[] };
  if (!Array.isArray(history) || history.length === 0) {
    return NextResponse.json({ error: "Falta el mensaje." }, { status: 400 });
  }

  try {
    const result = await chatWithJarvis(session.organizationId, history);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado." },
      { status: 500 }
    );
  }
}
