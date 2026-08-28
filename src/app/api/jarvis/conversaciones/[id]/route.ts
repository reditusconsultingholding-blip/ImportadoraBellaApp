import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { borrarConversacion, leerConversacion } from "@/lib/jarvis-chats";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const conv = await leerConversacion(session.userId, id);
  if (!conv) return NextResponse.json({ error: "No existe." }, { status: 404 });

  return NextResponse.json(conv);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  const borrada = await borrarConversacion(session.userId, id);
  if (!borrada) return NextResponse.json({ error: "No existe." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
