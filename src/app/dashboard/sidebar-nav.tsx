"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [{ href: "/dashboard", label: "Panel" }];
const TAIL_LINKS = [
  { href: "/dashboard/jarvis", label: "Preguntarle a Jarvis" },
  { href: "/dashboard/conexiones", label: "Conexiones" },
];

export default function SidebarNav({
  showUsuarios,
  showPipeline,
}: {
  showUsuarios: boolean;
  showPipeline: boolean;
}) {
  const pathname = usePathname();
  const links = [
    ...BASE_LINKS,
    ...(showPipeline ? [{ href: "/dashboard/pipeline", label: "Pipeline" }] : []),
    ...TAIL_LINKS,
    ...(showUsuarios ? [{ href: "/dashboard/usuarios", label: "Usuarios" }] : []),
  ];

  return (
    <nav className="flex flex-col gap-0.5 p-3">
      {links.map((link) => {
        const active = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`text-sm font-medium px-3 py-2 rounded transition ${
              active ? "bg-accent text-white" : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
