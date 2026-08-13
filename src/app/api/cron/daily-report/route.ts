import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateAndStoreDailyReport } from "@/lib/daily-report";

// Vercel Cron (ver vercel.json) — corre a las 05:00 UTC, que es medianoche
// en Ecuador (UTC-5, sin horario de verano). Genera un PDF por organización
// y notifica a cada OWNER con el link para verlo.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const orgs = await db.organization.findMany({ select: { id: true } });
  const results = await Promise.allSettled(orgs.map((o) => generateAndStoreDailyReport(o.id, new Date())));

  return NextResponse.json({
    generated: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
  });
}
