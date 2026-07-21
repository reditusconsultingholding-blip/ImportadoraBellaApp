import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncAdAccount } from "@/lib/integrations/sync";

// Job periódico (Vercel Cron, ver vercel.json) que sincroniza todas las
// cuentas ya conectadas — así los datos reales se actualizan solos, sin
// que alguien tenga que entrar a Conexiones y tocar "Sincronizar ahora".
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const accounts = await db.adAccount.findMany({ where: { accessToken: { not: null } } });
  const results = await Promise.allSettled(accounts.map((a) => syncAdAccount(a.id)));

  return NextResponse.json({
    synced: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    total: accounts.length,
  });
}
