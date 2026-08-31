import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canUseJarvis } from "@/lib/permissions";
import { listarConversaciones } from "@/lib/jarvis-chats";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canUseJarvis(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  return NextResponse.json({ conversaciones: await listarConversaciones(session.userId) });
}
