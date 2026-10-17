import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import { db } from "@/lib/db";
import { syncAdAccount } from "@/lib/integrations/sync";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";
import { hasWindsorKey } from "@/lib/integrations/windsor";
import { frenarUsuario } from "@/lib/limite";
import { mensajeSeguro } from "@/lib/respuesta";

/**
 * «Sincronizar ahora» de una cuenta publicitaria.
 *
 * ANTES ESTE BOTÓN NO PODÍA FUNCIONAR EN NINGUNA CUENTA. Pedía el token propio
 * de la cuenta y ninguna de las cuarenta y nueve lo tiene: los datos entran
 * todos por Windsor, que guarda la credencial de su lado. Apretarlo contestaba
 * «todavía no tiene un token conectado», que manda a buscar el problema al
 * lugar equivocado — justo el día que una cuenta de Meta llevaba cuatro sin
 * entregar datos, eso es lo que habría hecho perder la tarde.
 *
 * Ahora dispara la sincronización de verdad y, sobre todo, CONTESTA SI ESTA
 * CUENTA VINO EN LA RESPUESTA. Esa es la pregunta que se está haciendo quien
 * aprieta el botón, y la diferencia entre «hoy no hubo gasto» y «Windsor
 * contestó bien y esta cuenta no estaba» es todo el diagnóstico.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Cada sync consume cuota de Windsor.
  const frenado = frenarUsuario("sync-cuenta", session.userId, 20, 10 * 60 * 1000);
  if (frenado) return frenado;
  // Mismo permiso que crear la cuenta. Antes esta ruta solo miraba la
  // organización: cualquier editor podía reemplazar el token de producción
  // de una cuenta publicitaria, borrarla o quemar cuota sincronizando.
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const { id } = await params;
  const account = await db.adAccount.findUnique({ where: { id } });
  if (!account || account.organizationId !== session.organizationId) {
    return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
  }

  try {
    // Con token propio se le pregunta directo a la plataforma. Hoy no hay
    // ninguna así, pero el camino queda para quien pegue uno.
    if (account.accessToken) {
      await syncAdAccount(id);
      return NextResponse.json({ ok: true, vino: true, mensaje: "Sincronizada." });
    }

    if (!hasWindsorKey()) {
      return NextResponse.json(
        { error: "Falta la clave de Windsor.ai. Se carga como WINDSOR_API_KEY." },
        { status: 409 },
      );
    }

    const conector = account.platform === "META" ? "facebook" : "tiktok";
    const red = account.platform === "META" ? "Meta" : "TikTok";
    const r = await syncWindsorConnector(session.organizationId, conector, "last_7d");
    const vino = r.cuentas.includes(account.externalId);

    return NextResponse.json({
      ok: true,
      vino,
      mensaje: vino
        ? `Listo: Windsor devolvió esta cuenta (${r.campaigns} campañas, ${r.cambiados} días actualizados).`
        : `Windsor respondió bien y devolvió ${r.accounts} cuenta${r.accounts === 1 ? "" : "s"} de ${red}, ` +
          `pero esta no vino entre ellas. Puede estar corriendo igual en la plataforma: lo que se cortó es lo ` +
          `que Windsor nos entrega. Hay que reconectarla en Windsor.ai.`,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: mensajeSeguro(err) }, { status: 502 });
  }
}
