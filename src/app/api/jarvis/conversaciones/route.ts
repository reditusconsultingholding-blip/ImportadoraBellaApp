import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listarConversaciones } from "@/lib/jarvis-chats";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  return NextResponse.json({ conversaciones: await listarConversaciones(session.userId) });
}
