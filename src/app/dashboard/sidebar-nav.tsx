"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BASE_LINKS = [{ href: "/dashboard", label: "Panel" }];
const TAIL_LINKS = [
  { href: "/dashboard/notificaciones", label: "Notificaciones" },
  { href: "/dashboard/jarvis", label: "Preguntarle a Jarvis" },
  { href: "/dashboard/conexiones", label: "Conexiones" },
];

export default function SidebarNav({
  showUsuarios,
  showPipeline,
  showRentabilidad,
}: {
  showUsuarios: boolean;
  showPipeline: boolean;
  showRentabilidad: boolean;
}) {
  const pathname = usePathname();
  const links = [
    ...BASE_LINKS,
    ...(showPipeline ? [{ href: "/dashboard/pipeline", label: "Pipeline" }] : []),
    ...(showPipeline ? [{ href: "/dashboard/productos", label: "Productos" }] : []),
    ...(showPipeline ? [{ href: "/dashboard/desempeno", label: "Desempeño" }] : []),
    ...(showRentabilidad ? [{ href: "/dashboard/rentabilidad", label: "Rentabilidad" }] : []),
    ...(showRentabilidad ? [{ href: "/dashboard/calculadora", label: "Calculadora de precios" }] : []),
    ...(showRentabilidad ? [{ href: "/dashboard/reportes", label: "Reportes diarios" }] : []),
    ...(showPipeline ? [{ href: "/dashboard/logistica", label: "Torre logística" }] : []),
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
              active ? "bg-brand-green text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
