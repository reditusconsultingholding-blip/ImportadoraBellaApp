import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { hasWindsorKey, type WindsorConnector } from "@/lib/integrations/windsor";
import { syncWindsorConnector } from "@/lib/integrations/windsor-sync";

const CONNECTORS: WindsorConnector[] = ["facebook", "tiktok"];

// Disparo manual desde Conexiones. El automático va por /api/cron/sync.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tenés permiso para sincronizar." }, { status: 403 });
  }
  if (!hasWindsorKey()) {
    return NextResponse.json(
      { error: "Falta la clave de Windsor.ai. Se carga como WINDSOR_API_KEY." },
      { status: 409 }
    );
  }

  const { datePreset } = (await req.json().catch(() => ({}))) as { datePreset?: string };
  const preset = /^last_\d+d$/.test(datePreset ?? "") ? (datePreset as string) : "last_7d";

  // Cada conector se sincroniza por separado: que TikTok no esté conectado
  // todavía no tiene por qué impedir que entren los datos de Meta.
  const results = await Promise.allSettled(
    CONNECTORS.map((connector) => syncWindsorConnector(session.organizationId, connector, preset))
  );

  const detail = CONNECTORS.map((connector, i) => {
    const result = results[i];
    return result.status === "fulfilled"
      ? { connector, ok: true as const, ...result.value }
      : {
          connector,
          ok: false as const,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        };
  });

  return NextResponse.json({
    ok: detail.some((d) => d.ok),
    detail,
  });
}
