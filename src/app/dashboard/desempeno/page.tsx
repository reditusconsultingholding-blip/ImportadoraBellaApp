import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { canAccessPipeline } from "@/lib/permissions";
import { getEditorPerformance, REWARDS } from "@/lib/performance";

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function DesempenoPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const params = await searchParams;
  const { rows, month } = await getEditorPerformance(session.organizationId, params.month);
  const top3 = rows.filter((r) => r.score > 0).slice(0, 3);
  const [y, m] = month.split("-");
  const monthLabel = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Desempeño del equipo</h1>
        <p className="text-sm text-muted capitalize">{monthLabel} — recompensas para el top 3 del mes</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => {
          const editor = top3[i];
          return (
            <div key={i} className="bg-surface border border-border rounded p-5 text-center flex flex-col gap-2">
              <span className="text-3xl">{MEDAL[i]}</span>
              <p className="font-semibold">{editor ? editor.name : "—"}</p>
              <p className="text-xs text-muted">{editor ? `${editor.score} pts` : "Sin datos todavía"}</p>
              <p className="text-lg font-bold text-accent">${REWARDS[i]}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-surface border border-border rounded overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-sm">Tabla completa</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-mono uppercase tracking-wide text-muted">
                <th className="px-5 py-3">Editor</th>
                <th className="px-5 py-3 text-right">Asignados</th>
                <th className="px-5 py-3 text-right">Completados</th>
                <th className="px-5 py-3 text-right">Buen CPA</th>
                <th className="px-5 py-3 text-right">Mal CPA</th>
                <th className="px-5 py-3 text-right">Entrega rápida</th>
                <th className="px-5 py-3 text-right">Puntaje</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.userId} className="border-t border-border">
                  <td className="px-5 py-3 font-medium">
                    {i < 3 && r.score > 0 ? `${MEDAL[i]} ` : ""}
                    {r.name}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.assigned}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.completed}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-good">{r.goodPerformance}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-critical">{r.badPerformance}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.fastTurnaround}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">{r.score}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-muted">
                    Todavía no hay editores en el equipo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted">
        Puntaje = completados en el mes (+1 c/u) + buen CPA en Testeado (+2 c/u) − mal CPA en Testeado (−1 c/u) +
        entrega rápida (+1 por cada pieza que llegó a un estado terminado en 3 días o menos desde que se creó). Es
        un criterio de arranque — se puede ajustar el peso apenas el equipo defina uno más formal.
      </p>
    </div>
  );
}
