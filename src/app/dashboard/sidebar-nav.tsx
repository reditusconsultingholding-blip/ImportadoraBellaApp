"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Iconos dibujados a mano sobre una grilla de 20px, todos con el mismo grosor
// de trazo. Nada de emoji: un set consistente es la mitad de la sensación de
// "app cuidada", y así escalan y toman el color del texto.
const icons: Record<string, React.ReactNode> = {
  panel: (
    <>
      <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="2.5" width="6.5" height="4" rx="1.5" />
      <rect x="2.5" y="11" width="6.5" height="6.5" rx="1.5" />
      <rect x="11" y="8.5" width="6.5" height="9" rx="1.5" />
    </>
  ),
  pipeline: (
    <>
      <rect x="2.5" y="3" width="4.5" height="14" rx="1.5" />
      <rect x="8.5" y="3" width="4.5" height="9" rx="1.5" />
      <rect x="14.5" y="3" width="3" height="11" rx="1.5" />
    </>
  ),
  productos: (
    <>
      <path d="M10 2.5 17.5 6.5v7L10 17.5 2.5 13.5v-7z" />
      <path d="M2.5 6.5 10 10.5l7.5-4M10 10.5v7" />
    </>
  ),
  rentabilidad: (
    <>
      <path d="M2.5 15.5h15" />
      <path d="M5 15.5V9M9 15.5V4.5M13 15.5v-8M17 15.5v-4" />
    </>
  ),
  calculadora: (
    <>
      <rect x="4" y="2.5" width="12" height="15" rx="2" />
      <path d="M7 6h6M7 9.5h.01M10 9.5h.01M13 9.5h.01M7 12.5h.01M10 12.5h.01M13 12.5h.01" />
    </>
  ),
  reportes: (
    <>
      <path d="M11 2.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.5z" />
      <path d="M11 2.5v5h5M7.5 11h5M7.5 14h3" />
    </>
  ),
  logistica: (
    <>
      <path d="M2.5 6.5h8v7h-8z" />
      <path d="M10.5 9h3.5l3 2.5v2h-6.5z" />
      <circle cx="5.5" cy="15" r="1.6" />
      <circle cx="14" cy="15" r="1.6" />
    </>
  ),
  nomina: (
    <>
      <rect x="2.5" y="5" width="15" height="10" rx="2" />
      <circle cx="10" cy="10" r="2.2" />
      <path d="M5.5 10h.01M14.5 10h.01" />
    </>
  ),
  notificaciones: (
    <>
      <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5-1.5 5h12s-1.5-1-1.5-5A4.5 4.5 0 0 0 10 3z" />
      <path d="M8.5 15a1.7 1.7 0 0 0 3 0" />
    </>
  ),
  jarvis: (
    <>
      <path d="M17 12.5A2.5 2.5 0 0 1 14.5 15H7l-3.5 2.5v-12A2.5 2.5 0 0 1 6 3h8.5A2.5 2.5 0 0 1 17 5.5z" />
      <path d="M7 7.5h6M7 10.5h4" />
    </>
  ),
  conexiones: (
    <>
      <path d="M8 12l4-4" />
      <path d="M11 5.5 12.5 4a3.2 3.2 0 0 1 4.5 4.5L15.5 10" />
      <path d="M9 14.5 7.5 16A3.2 3.2 0 0 1 3 11.5L4.5 10" />
    </>
  ),
  cuenta: (
    <>
      <circle cx="10" cy="7" r="3" />
      <path d="M4 16.5a6 6 0 0 1 12 0" />
    </>
  ),
  usuarios: (
    <>
      <circle cx="8" cy="7" r="2.6" />
      <path d="M3 16a5 5 0 0 1 10 0" />
      <path d="M13.5 5.2a2.6 2.6 0 0 1 0 4.6M14.5 16a5 5 0 0 0-1.6-3.7" />
    </>
  ),
};

function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}

type Link = { href: string; label: string; icon: string };
type Group = { title: string | null; links: Link[] };

export default function SidebarNav({
  showUsuarios,
  showPipeline,
  showRentabilidad,
  showNomina,
}: {
  showUsuarios: boolean;
  showPipeline: boolean;
  showRentabilidad: boolean;
  // Nómina no se muestra por rol: es un permiso por persona. Quien no lo
  // tenga no ve ni el link.
  showNomina: boolean;
}) {
  const pathname = usePathname();

  // Agrupado por lo que la persona está haciendo, no por orden de
  // construcción: mirar el negocio / producir contenido / administrar. Una
  // lista plana de 13 items obliga a leerla entera cada vez.
  const groups: Group[] = [
    {
      title: null,
      links: [{ href: "/dashboard", label: "Panel", icon: "panel" }],
    },
    {
      title: "Producción",
      links: [
        ...(showPipeline
          ? [
              { href: "/dashboard/pipeline", label: "Pipeline", icon: "pipeline" },
              { href: "/dashboard/productos", label: "Productos", icon: "productos" },
            ]
          : []),
      ],
    },
    {
      title: "Números",
      links: [
        ...(showRentabilidad
          ? [
              { href: "/dashboard/rentabilidad", label: "Rentabilidad", icon: "rentabilidad" },
              { href: "/dashboard/calculadora", label: "Calculadora", icon: "calculadora" },
              { href: "/dashboard/reportes", label: "Reportes diarios", icon: "reportes" },
            ]
          : []),
        ...(showPipeline
          ? [{ href: "/dashboard/logistica", label: "Torre logística", icon: "logistica" }]
          : []),
        ...(showNomina ? [{ href: "/dashboard/nomina", label: "Nómina", icon: "nomina" }] : []),
      ],
    },
    {
      title: "Cuenta",
      links: [
        { href: "/dashboard/chat", label: "Chat interno", icon: "jarvis" },
        { href: "/dashboard/notificaciones", label: "Notificaciones", icon: "notificaciones" },
        { href: "/dashboard/jarvis", label: "Preguntarle a Jarvis", icon: "jarvis" },
        { href: "/dashboard/conexiones", label: "Conexiones", icon: "conexiones" },
        { href: "/dashboard/configuracion", label: "Mi cuenta", icon: "cuenta" },
        ...(showUsuarios
          ? [{ href: "/dashboard/usuarios", label: "Usuarios", icon: "usuarios" }]
          : []),
      ],
    },
  ].filter((g) => g.links.length > 0);

  return (
    <nav className="flex flex-col gap-5 px-3 py-4 overflow-y-auto">
      {groups.map((group, i) => (
        <div key={group.title ?? `g${i}`} className="flex flex-col gap-0.5">
          {group.title && (
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/40">
              {group.title}
            </p>
          )}
          {group.links.map((link) => {
            const active =
              link.href === "/dashboard"
                ? pathname === link.href
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded px-3 py-2 text-[13px] font-medium transition ${
                  active
                    ? "bg-white/12 text-white"
                    : "text-white/65 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                {/* Marca de página activa: una barra fina a la izquierda en vez
                    de pintar todo el renglón de color. */}
                <span
                  className={`absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-green transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className={active ? "text-brand-green" : "text-white/50 group-hover:text-white/80"}>
                  <Icon name={link.icon} />
                </span>
                <span className="truncate">{link.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
