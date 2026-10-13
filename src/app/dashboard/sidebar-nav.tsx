"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarraDeCarga, Girando, useNavegar } from "./navegar";
import { IconoSeccion } from "./icono-seccion";

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
          ? [{ href: "/dashboard/ceo", label: "Estadísticas CEO", icon: "ceo" }]
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
          ? [{ href: "/dashboard/sin-nomenclatura", label: "Sin nomenclatura", icon: "sin-nomenclatura" }]
          : []),
      ],
    },
    {
      title: "Números",
      links: [
        ...(showRentabilidad
          ? [
              // Primero de Números: es la pantalla que reemplaza el Excel que
              // el equipo cuadra a mano todos los días.
              { href: "/dashboard/control", label: "Control publicitario", icon: "control" },
              { href: "/dashboard/rentabilidad", label: "Rentabilidad", icon: "rentabilidad" },
              { href: "/dashboard/clientes", label: "Clientes", icon: "clientes" },
              { href: "/dashboard/origen", label: "Origen de las ventas", icon: "origen" },
              // Una sola calculadora. Hubo dos seguidas ("Calculadora de
              // precios" y "Costeo y utilidad") que se leían como lo mismo; por
              // pedido de dirección quedó la de precios, con lo mejor de la
              // otra adentro (septiembre de 2026).
              { href: "/dashboard/calculadora", label: "Calculadora de precios", icon: "calculadora" },
              // Las apps que se cobran solas todos los meses. Va en Números y
              // no en Configuraciones porque es plata que sale, y porque una
              // pantalla de ajustes no se mira: esta tiene que estar donde ya
              // se entra a ver cuánto se gastó.
              { href: "/dashboard/pagos", label: "Pagos y suscripciones", icon: "pagos" },
            ]
          : []),
        ...(showReportes
          ? [{ href: "/dashboard/reportes", label: "Reportes diarios", icon: "reportes" }]
          : []),
        // Torre logística queda fuera del menú por pedido de dirección
        // (22 de septiembre de 2026): todavía no tiene datos, porque depende
        // de la conexión con Dropi. La pantalla sigue viva en
        // /dashboard/logistica para cuando se conecte.
        ...(showLogistica && false
          ? [{ href: "/dashboard/logistica", label: "Torre logística", icon: "logistica" }]
          : []),
        ...(showNomina ? [{ href: "/dashboard/nomina", label: "Nómina", icon: "nomina" }] : []),
      ],
    },
    {
      title: "Cuenta",
      links: [
        ...(showContenido
          ? [{ href: "/dashboard/chat", label: "Chat interno", icon: "chat" }]
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
        { href: "/dashboard/configuracion", label: "Configuraciones", icon: "configuracion" },
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
                    <IconoSeccion nombre={link.icon} tono="oscuro" tamano={20} activo={active} />
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
