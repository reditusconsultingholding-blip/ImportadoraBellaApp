import { STATUS_LABEL } from "@/lib/pipeline-options";
import type { RequirementRow } from "./types";

const STATUS_TONE: Record<string, string> = {
  PENDIENTE: "bg-pending-bg text-muted",
  EN_EDICION: "bg-accent/15 text-accent-strong",
  LISTO_PARA_REVISAR: "bg-accent/15 text-accent-strong",
  APROBADO: "bg-good-bg text-good",
  REALIZADO: "bg-good-bg text-good",
  EDITADO: "bg-good-bg text-good",
  TESTEADO: "bg-good-bg text-good",
};

export default function RequirementsTable({
  requirements,
  onOpen,
}: {
  requirements: RequirementRow[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="bg-surface border border-border rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Anuncio</th>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Fase</th>
              <th className="px-4 py-3">Ángulo</th>
              <th className="px-4 py-3">Awareness</th>
              <th className="px-4 py-3">Editor</th>
              <th className="px-4 py-3">CPA</th>
              <th className="px-4 py-3">Hook Rate</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {requirements.map((r) => (
              <tr
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="border-t border-border hover:bg-surface-2 cursor-pointer transition"
              >
                <td className="px-4 py-3 font-medium max-w-xs truncate">{r.adName}</td>
                <td className="px-4 py-3 text-muted font-mono text-xs">{r.product?.code ?? "—"}</td>
                <td className="px-4 py-3 text-xs">{r.adType}</td>
                <td className="px-4 py-3 text-xs text-muted">{r.phase}</td>
                <td className="px-4 py-3 text-xs text-muted max-w-[10rem] truncate">{r.angle}</td>
                <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">{r.awarenessLevel}</td>
                <td className="px-4 py-3 text-xs">{r.owner?.name ?? "Sin asignar"}</td>
                <td className="px-4 py-3 tabular-nums text-xs">{r.cpa ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums text-xs">{r.hookRate !== null ? `${r.hookRate}%` : "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`font-mono text-[10px] px-2 py-1 rounded whitespace-nowrap ${
                      STATUS_TONE[r.status] ?? "bg-surface-2 text-muted"
                    }`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </td>
              </tr>
            ))}
            {requirements.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-muted">
                  Sin requerimientos todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
