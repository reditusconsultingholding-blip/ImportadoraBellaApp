import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { db } from "@/lib/db";
import { registrarActividad } from "@/lib/actividad";

/**
 * Callar el aviso de una cuenta, con el motivo escrito.
 *
 * Existe porque la alarma de salud de las cuentas ya no se apaga con el paso
 * del tiempo —antes dejaba de avisar al undécimo día aunque la conexión
 * siguiera rota— y algo tiene que poder cerrarla. Lo cierra una persona
 * declarando qué pasa, o los datos cuando vuelven.
 *
 * Las dos declaraciones se levantan solas en cuanto dejan de ser ciertas, y eso
 * lo hace `anotarSaludDeCuentas` en cada vuelta del reloj: una cuenta «apagada»
 * que vuelve a entregar datos está encendida otra vez, y una que «vende por
 * WhatsApp» y registra una compra por la web sí podía registrarlas.
 *
 * Queda escrito quién lo declaró. No es por desconfianza: dentro de un mes, la
 * pregunta «¿por qué esta cuenta no avisa?» tiene que tener respuesta.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // El mismo permiso que conectar una cuenta: callar un aviso de datos que
  // faltan es una decisión de operación, no de cualquiera que entre al panel.
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { id } = await params;
  const { accion } = (await req.json().catch(() => ({}))) as { accion?: string };

  const account = await db.adAccount.findUnique({ where: { id } });
  if (!account || account.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  const quien = session.userId;

  if (accion === "apagada") {
    await db.adAccount.update({
      where: { id },
      data: { apagadaAt: new Date(), apagadaPor: quien },
    });
  } else if (accion === "vende-por-whatsapp") {
    await db.adAccount.update({
      where: { id },
      data: { ventaFueraWebAt: new Date(), ventaFueraWebPor: quien },
    });
  } else if (accion === "vigilar") {
    // Deshacer: la cuenta vuelve a vigilarse como cualquier otra.
    await db.adAccount.update({
      where: { id },
      data: {
        apagadaAt: null,
        apagadaPor: null,
        ventaFueraWebAt: null,
        ventaFueraWebPor: null,
      },
    });
  } else {
    return NextResponse.json({ error: "Acción desconocida." }, { status: 400 });
  }

  registrarActividad({
    organizationId: session.organizationId,
    userId: quien,
    tipo: "accion",
    ruta: `/api/accounts/${id}/vigilancia`,
    detalle: `${accion} · ${account.name}`,
  });

  return NextResponse.json({ ok: true });
}
