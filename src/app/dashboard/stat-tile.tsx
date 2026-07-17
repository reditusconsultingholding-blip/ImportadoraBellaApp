export default function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded p-5">
      <p className="font-mono text-xs uppercase tracking-wide text-muted mb-2">
        {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-muted mt-1">{note}</p>}
    </div>
  );
}
