import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canAccessPipeline,
  canManageConexiones,
  canManagePipeline,
  canUseJarvis,
  canViewFinancials,
} from "@/lib/permissions";
import { pasosParaUsuario } from "@/lib/capacitacion-pasos";
import CapacitacionTour from "./capacitacion-tour";
import LogoutButton from "./logout-button";
import LiveIndicator from "./live-indicator";
import LiveRefresher from "./live-refresher";
import SidebarNav from "./sidebar-nav";
import NotificationsBell from "./notifications-bell";
import MobileNav from "./mobile-nav";
import AvisoLlamada from "./chat/aviso-llamada";
import AnunciosGlobales from "./anuncios-globales";

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, me] = await Promise.all([
    db.organization.findUnique({ where: { id: session.organizationId } }),
    // Los permisos por persona —nómina y finanzas— se leen de la base y no del
    // JWT: la sesión dura 30 días, así que quitarle un acceso a alguien no
    // tendría efecto hasta que volviera a entrar.
    db.user.findUnique({
      where: { id: session.userId },
      select: {
        canViewPayroll: true,
        canViewFinancials: true,
        avatarUrl: true,
        capacitacionVista: true,
        capacitacionAperturas: true,
      },
    }),
  ]);

  const veCifras = canViewFinancials(me);

  // Qué le toca ver del recorrido se resuelve en el servidor, con el rol y el
  // permiso ya leídos de la base. Mandarle la lista entera al navegador para
  // filtrarla allá sería contarle a un editor qué hay en las pantallas que no
  // puede abrir.
  const pasosCapacitacion = pasosParaUsuario({
    rol: session.role,
    vePayroll: Boolean(me?.canViewPayroll),
    veCifras,
  });

  // El menú y la ficha del usuario se arman una sola vez y se usan en los dos
  // lados: la barra fija de escritorio y el cajón del teléfono. Duplicarlos
  // sería garantizar que en algún momento digan cosas distintas.
  // El nombre entero en una línea, no partido en dos.
  //
  // Antes decía "Importadora" chiquito arriba y "Bella" grande abajo, que se
  // lee como si la empresa se llamara Bella. Va con la misma tipografía del
  // acceso —Geist, semibold, con el espaciado ajustado— para que la marca se
  // vea igual antes y después de entrar.
  const brand = (
    <>
      <p className="text-[19px] font-semibold leading-tight tracking-tight text-white">
        Importadora Bella
      </p>
      <p className="mt-0.5 text-[11px] leading-none text-white/45">by Reditus Developers</p>
    </>
  );

  const nav = (
    <SidebarNav
      showUsuarios={session.role === "OWNER"}
      showContenido={canAccessPipeline(session.role)}
      showRentabilidad={canManagePipeline(session.role) && veCifras}
      showReportes={canManagePipeline(session.role)}
      showLogistica={canAccessPipeline(session.role) && veCifras}
      showConexiones={canManageConexiones(session.role)}
      showJarvis={canUseJarvis(session.role)}
      showNomina={Boolean(me?.canViewPayroll)}
      showCeo={session.role === "OWNER" && veCifras}
    />
  );

  const account = (
    <div className="mt-auto border-t border-white/10 px-3 py-3">
      <div className="flex items-center gap-2.5 rounded px-2 py-1.5">
        {me?.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-green/20 text-[11px] font-semibold text-brand-green">
            {initials(session.name)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-white">{session.name}</span>
          <span className="block truncate text-[11px] text-white/45">
            {org?.name ?? "Importadora Bella"}
          </span>
        </span>
        <LogoutButton />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background md:flex">
      {/* Escritorio: barra lateral fija. En el teléfono se oculta y su lugar lo
          toma el cajón de MobileNav. */}
      <aside className="hidden w-60 shrink-0 bg-brand-navy md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div className="px-5 pt-5 pb-4">{brand}</div>
        {nav}
        {account}
      </aside>

      <MobileNav brand={brand}>
        {nav}
        {account}
      </MobileNav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Van arriba de todo y en el layout porque tienen que verse desde
            cualquier pantalla: una llamada en curso o un anuncio nuevo no
            sirven de nada si solo aparecen dentro del chat. */}
        <AvisoLlamada />
        <AnunciosGlobales />
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-sm">
          <div className="flex h-14 items-center justify-end gap-3 px-4 md:px-8">
            {/* El recorrido va en el encabezado y no en el menú lateral porque
                es lo único que se puede necesitar estando en cualquier
                pantalla: desde acá se abre sin perder dónde estabas, y en el
                teléfono el menú está cerrado. */}
            {/* La clave depende de si ya la vio para que reiniciarla desde
                Usuarios tenga efecto sin recargar el navegador: sin esto el
                componente conserva su estado y el recorrido no se vuelve a
                abrir solo. */}
            <CapacitacionTour
              key={String(Boolean(me?.capacitacionVista))}
              pasos={pasosCapacitacion}
              yaVista={Boolean(me?.capacitacionVista)}
              aperturas={me?.capacitacionAperturas ?? 0}
            />
            <LiveIndicator />
            <NotificationsBell />
          </div>
        </header>
        <LiveRefresher />
        <main className="w-full max-w-[1200px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
