"use client";

import { useState } from "react";

export default function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-surface-2 text-left"
      >
        <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-muted">
          <svg
            viewBox="0 0 16 16"
            width="10"
            height="10"
            className={`transition-transform ${open ? "rotate-90" : ""}`}
          >
            <path d="M4 2 L12 8 L4 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {title}
          {typeof count === "number" && <span className="text-accent-strong">({count})</span>}
        </span>
      </button>
      {open && <div className="p-4 flex flex-col gap-4 bg-background">{children}</div>}
    </div>
  );
}
