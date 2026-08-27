export default function StatTile({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  // El color solo aparece cuando el número significa algo. Por defecto, nada.
  tone?: "neutral" | "good" | "bad";
}) {
  const valueTone =
    tone === "good" ? "text-good" : tone === "bad" ? "text-critical" : "text-foreground";

  return (
    <div className="bg-surface border border-border rounded p-4">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1.5 text-[26px] font-semibold leading-none tabular-nums ${valueTone}`}>
        {value}
      </p>
      {note && <p className="mt-1.5 text-xs text-muted leading-snug">{note}</p>}
    </div>
  );
}
