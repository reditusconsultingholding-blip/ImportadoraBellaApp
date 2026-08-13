import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManagePipeline } from "@/lib/permissions";
import ReportsList from "./reports-list";

export default async function ReportesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canManagePipeline(session.role)) redirect("/dashboard");

  const reports = await db.dailyReport.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { date: "desc" },
    take: 60,
    select: { id: true, date: true, createdAt: true },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Reportes diarios</h1>
        <p className="text-sm text-muted">
          Un PDF por día con ventas, campañas y alertas — se genera solo a medianoche y le avisa al CEO.
        </p>
      </div>
      <ReportsList
        initialReports={reports.map((r) => ({
          id: r.id,
          date: r.date.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
