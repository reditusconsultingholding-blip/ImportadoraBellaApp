"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarraDeCarga, Girando, useNavegar } from "./navegar";

// --- Qué grupos del menú están plegados -------------------------------------
//
// Vive en el navegador y no en la base: es cómo alguien quiere ver SU menú, no
// un dato de la empresa. Guardarlo en el servidor costaría una consulta más en
// cada carga para algo que a nadie más le importa.

const CLAVE_PLEGADO = "jarvis:menu-plegado";

/** Quien esté mirando se entera cuando el valor cambia. */
const oyentes = new Set<() => void>();

function suscribirPlegado(avisar: () => void) {
  oyentes.add(avisar);
  // También si lo cambian en otra pestaña abierta.
  window.addEventListener("storage", avisar);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

function leerPlegado() {
  try {
    return window.localStorage.getItem(CLAVE_PLEGADO) ?? "[]";
  } catch {
    // Navegador con el almacenamiento bloqueado: el menú abre entero, que es
    // el lado seguro — nadie pierde de vista una herramienta.
    return "[]";
  }
}

function guardarPlegado(valor: string) {
  try {
    window.localStorage.setItem(CLAVE_PLEGADO, valor);
  } catch {
    /* sin almacenamiento: no se recuerda, pero el clic igual responde */
  }
  for (const avisar of oyentes) avisar();
}

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
  contenido: (
    <>
      <rect x="2.5" y="4" width="15" height="13" rx="2" />
      <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" />
      <path d="M6 11.5h.01M10 11.5h.01M14 11.5h.01M6 14.5h.01M10 14.5h.01" />
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
  showContenido,
  showRentabilidad,
  showReportes,
  showLogistica,
  showConexiones,
  showJarvis,
  showNomina,
  showCeo,
}: {
  showUsuarios: boolean;
  showContenido: boolean;
  /**
   * Las pantallas de plata: Rentabilidad, Clientes y la Calculadora.
   *
   * Estas tres ya redirigen a quien no tiene el permiso de finanzas, pero un
   * enlace que lleva a un redirect es una pared que se ve: dice qué hay del
   * otro lado y hace que la app se sienta rota. Si no se pueden abrir, no se
   * listan.
   */
  showRentabilidad: boolean;
  /** Reportes sí se ve sin el permiso, pero sin las cifras de dinero. */
  showReportes: boolean;
  /** Torre logística: el dueño la puso del lado de la dirección. */
  showLogistica: boolean;
  showConexiones: boolean;
  showJarvis: boolean;
  // Nómina no se muestra por rol: es un permiso por persona. Quien no lo
  // tenga no ve ni el link.
  showNomina: boolean;
  /** El panel del dueño: solo OWNER. */
  showCeo: boolean;
}) {
  const pathname = usePathname();
  const { navegar, pendiente, destino } = useNavegar();

  // Agrupado por lo que la persona está haciendo, no por orden de
  // construcción: mirar el negocio / producir contenido / administrar. Una
  // lista plana de 13 items obliga a leerla entera cada vez.
  const groups: Group[] = [
    {
      title: null,
      links: [
        { href: "/dashboard", label: "Panel", icon: "panel" },
        // El panel del dueño solo para OWNER: un director ve lo suyo en las
        // pantallas de siempre.
        ...(showCeo
          ? [{ href: "/dashboard/ceo", label: "Estadísticas CEO", icon: "panel" }]
          : []),
      ],
    },
    {
      title: "Producción",
      links: [
        ...(showContenido
          ? [
              { href: "/dashboard/contenido", label: "Contenido", icon: "contenido" },
              { href: "/dashboard/productos", label: "Productos", icon: "productos" },
            ]
          : []),
        // Va en Producción y no en Números aunque hable de gasto: lo que se
        // hace acá es arreglar cómo están nombradas y conectadas las campañas,
        // que es trabajo de producción. El gasto solo dice cuál arreglar
        // primero. Pide el permiso de finanzas porque la tabla es plata.
        ...(showRentabilidad
          ? [{ href: "/dashboard/sin-nomenclatura", label: "Sin nomenclatura", icon: "productos" }]
          : []),
      ],
    },
    {
      title: "Números",
      links: [
        ...(showRentabilidad
          ? [
              { href: "/dashboard/rentabilidad", label: "Rentabilidad", icon: "rentabilidad" },
              { href: "/dashboard/clientes", label: "Clientes", icon: "usuarios" },
              { href: "/dashboard/calculadora", label: "Calculadora", icon: "calculadora" },
              { href: "/dashboard/calculadora/costeo", label: "Costeo y utilidad", icon: "calculadora" },
            ]
          : []),
        ...(showReportes
          ? [{ href: "/dashboard/reportes", label: "Reportes diarios", icon: "reportes" }]
          : []),
        ...(showLogistica
          ? [{ href: "/dashboard/logistica", label: "Torre logística", icon: "logistica" }]
          : []),
        ...(showNomina ? [{ href: "/dashboard/nomina", label: "Nómina", icon: "nomina" }] : []),
      ],
    },
    {
      title: "Cuenta",
      links: [
        ...(showContenido
          ? [{ href: "/dashboard/chat", label: "Chat interno", icon: "jarvis" }]
          : []),
        { href: "/dashboard/notificaciones", label: "Notificaciones", icon: "notificaciones" },
        // Jarvis y Conexiones ya estaban cerrados por rol, pero seguían
        // apareciendo en el menú de todos: se entraba y rebotaba al Panel.
        ...(showJarvis
          ? [{ href: "/dashboard/jarvis", label: "Preguntarle a Jarvis", icon: "jarvis" }]
          : []),
        ...(showConexiones
          ? [{ href: "/dashboard/conexiones", label: "Conexiones", icon: "conexiones" }]
          : []),
        { href: "/dashboard/configuracion", label: "Configuraciones", icon: "cuenta" },
        ...(showUsuarios
          ? [{ href: "/dashboard/usuarios", label: "Usuarios", icon: "usuarios" }]
          : []),
      ],
    },
  ].filter((g) => g.links.length > 0);

  // Qué grupos están plegados, recordado entre visitas.
  //
  // Se guarda en el navegador y no en la base: es una preferencia de cómo
  // alguien quiere ver SU menú, no un dato de la empresa. Guardarlo en el
  // servidor obligaría a una consulta más en cada carga para algo que a nadie
  // más le importa.
  //
  // Arranca vacío y se lee después de montar, no durante: leer localStorage
  // en el primer render haría que el servidor y el navegador dibujen cosas
  // distintas y React se queje de la hidratación.
  // Se lee con useSyncExternalStore y no con un efecto: el almacenamiento del
  // navegador es un sistema externo, y leerlo desde un efecto para meterlo en
  // el estado encadena renders (es la misma razón por la que el recorrido de
  // capacitación mide la posición así).
  //
  // Devuelve el TEXTO crudo y no el arreglo ya parseado: useSyncExternalStore
  // compara por identidad, y un arreglo nuevo en cada lectura lo haría girar
  // sin parar.
  const crudo = useSyncExternalStore(suscribirPlegado, leerPlegado, () => "[]");
  const plegados = useMemo<string[]>(() => {
    try {
      const v = JSON.parse(crudo);
      return Array.isArray(v) ? (v as string[]) : [];
    } catch {
      return [];
    }
  }, [crudo]);

  const alternar = useCallback(
    (titulo: string) => {
      const siguiente = plegados.includes(titulo)
        ? plegados.filter((t) => t !== titulo)
        : [...plegados, titulo];
      guardarPlegado(JSON.stringify(siguiente));
    },
    [plegados],
  );

  return (
    <nav className="flex flex-col gap-4 px-3 py-4 overflow-y-auto">
      <BarraDeCarga activa={pendiente} />

      {groups.map((group, i) => {
        const plegado = group.title ? plegados.includes(group.title) : false;
        // El grupo sin título son Panel y Estadísticas CEO: no se pliegan
        // porque no son una familia, son la entrada.
        return (
          <div key={group.title ?? `g${i}`} className="flex flex-col gap-0.5">
            {group.title && (
              <button
                type="button"
                onClick={() => alternar(group.title as string)}
                aria-expanded={!plegado}
                className="flex w-full items-center gap-1.5 rounded px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/40 transition hover:bg-white/[0.06] hover:text-white/70"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden
                  className={`transition-transform ${plegado ? "-rotate-90" : ""}`}
                >
                  <path d="M2 3.5 5 6.5l3-3" stroke="currentColor" strokeWidth="1.6" />
                </svg>
                {group.title}
                {/* Cuántas quedan escondidas: sin esto, un grupo plegado se
                    ve igual que uno vacío y parece que se perdieron. */}
                {plegado && <span className="ml-auto normal-case tracking-normal">{group.links.length}</span>}
              </button>
            )}

            {!plegado &&
              group.links.map((link) => {
                const active =
                  link.href === "/dashboard"
                    ? pathname === link.href
                    : pathname.startsWith(link.href);
                const cargando = destino === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    aria-busy={cargando}
                    // Se intercepta el clic para poder mostrar el circulito
                    // mientras el servidor arma la pantalla. Se respetan
                    // ctrl/cmd y el botón del medio, que abren en otra pestaña
                    // y no deberían disparar la carga de esta.
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      navegar(link.href, link.href);
                    }}
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
                    <span
                      className={active ? "text-brand-green" : "text-white/50 group-hover:text-white/80"}
                    >
                      <Icon name={link.icon} />
                    </span>
                    <span className="truncate">{link.label}</span>
                    {cargando && <Girando className="ml-auto shrink-0 text-brand-green" />}
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
