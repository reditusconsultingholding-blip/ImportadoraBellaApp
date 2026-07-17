import Link from "next/link";
import type { Platform } from "@/generated/prisma/client";

const TABS: { value: Platform; label: string }[] = [
  { value: "META", label: "Meta (Facebook + Instagram)" },
  { value: "TIKTOK", label: "TikTok" },
];

export default function PlatformTabs({ active }: { active: Platform }) {
  return (
    <div className="flex items-center gap-1 border border-border rounded p-1 w-fit">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={`/dashboard?platform=${tab.value}`}
          className={`text-sm px-3 py-1.5 rounded transition ${
            active === tab.value
              ? "bg-accent text-white"
              : "text-muted hover:bg-surface-2"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
