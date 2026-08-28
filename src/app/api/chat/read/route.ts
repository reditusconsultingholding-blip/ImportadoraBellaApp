import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { parseScope, resolveScope, scopeKey } from "@/lib/chat";

// Marca una conversación como leída hasta ahora. Es lo que apaga el puntito
// azul del canal en la lista de la izquierda.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canAccessPipeline(session.role)) {
    return NextResponse.json({ error: "Todavía no tienes un rol asignado." }, { status: 403 });
  }

  const { scope: rawScope } = (await req.json()) as { scope?: string };
  const scope = parseScope(rawScope);
  if (!scope) return NextResponse.json({ error: "Conversación inválida." }, { status: 400 });

  const resolved = await resolveScope(session, scope);
  if (!resolved) return NextResponse.json({ error: "Conversación no encontrada." }, { status: 404 });

  const key = scopeKey(scope);
  await db.chatRead.upsert({
    where: { userId_scope: { userId: session.userId, scope: key } },
    create: { userId: session.userId, scope: key, readAt: new Date() },
    update: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
