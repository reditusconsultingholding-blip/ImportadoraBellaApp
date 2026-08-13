import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  const notification = await db.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== session.userId) {
    return NextResponse.json({ error: "No encontrada." }, { status: 404 });
  }

  await db.notification.update({ where: { id }, data: { read: true } });
  return NextResponse.json({ ok: true });
}
