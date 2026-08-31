"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ETIQUETA_CIERRE } from "@/lib/reporte-horario";

type Report = { id: string; date: string; createdAt: string };

export default function ReportsList({ initialReports }: { initialReports: Report[] }) {
  const router = useRouter();
  const [reports, setReports] = useState(initialReports);
  const [generating, setGenerating] = useState(false);

  async function generateToday() {
    setGenerating(true);
    try {
      const res = await fetch("/api/reports/generate", { method: "POST" });
      if (res.ok) {
        const { id, date } = await res.json();
        setReports((prev) => {
          const without = prev.filter((r) => r.id !== id);
          return [{ id, date, createdAt: new Date().toISOString() }, ...without];
        });
        router.refresh();
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* El título vive acá y no en la pantalla porque este bloque es el único
          que habla de los PDF diarios: lo de arriba es el período elegido. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Reportes diarios</h2>
          <p className="text-xs text-muted">
            Un PDF por día, con el cierre de ese día. Se guardan los últimos 60.
          </p>
        </div>
        <button
          onClick={generateToday}
          disabled={generating}
          className="text-sm font-medium bg-accent text-white rounded px-4 py-2 disabled:opacity-60"
        >
          {generating ? "Generando…" : "Generar el de hoy"}
        </button>
      </div>

      <div className="bg-surface border border-border rounded overflow-hidden">
        {reports.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">
            Todavía no se generó ningún reporte. El primero sale solo a las {ETIQUETA_CIERRE}, o
            genéralo ahora.
          </p>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3.5 border-b border-border last:border-b-0">
              <div>
                <p className="text-sm font-medium">
                  {new Date(r.date).toLocaleDateString("es-EC", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })}
                </p>
                <p className="text-xs text-muted font-mono">
                  generado {new Date(r.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <a
                href={`/api/reports/${r.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-accent hover:underline"
              >
                Ver PDF
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
