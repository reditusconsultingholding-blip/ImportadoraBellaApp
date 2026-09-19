import { NextResponse } from "next/server";
import { destroySession, getSession } from "@/lib/auth";
import { contextoDelPedido, registrarActividad } from "@/lib/actividad";

export async function POST() {
  const session = await getSession();
  if (session) {
    registrarActividad({
      organizationId: session.organizationId,
      userId: session.userId,
      tipo: "salida",
      ruta: "/logout",
      ...(await contextoDelPedido()),
    });
  }
  await destroySession();
  return NextResponse.json({ ok: true });
}
