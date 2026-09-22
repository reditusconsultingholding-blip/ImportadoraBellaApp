"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { Girando } from "./navegar";

// Un enlace que avisa que está cargando.
//
// `useLinkStatus` solo funciona dentro de un <Link>, así que el indicador tiene
// que ser un componente aparte que va adentro. De ahí que esto sean dos piezas
// y no una.

function Indicador() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Girando />;
}

export default function LinkCargando({
  href,
  className,
  title,
  ariaCurrent,
  /**
   * Quedarse donde está al navegar.
   *
   * Por defecto Next lleva la página al principio en cada navegación. En los
   * botones que solo cambian una parte de la pantalla —elegir Meta o TikTok
   * dentro de "Rendimiento de campañas"— eso se ve como si la página entera
   * se recargara y hay que volver a bajar hasta la tabla.
   */
  sinSalto,
  children,
}: {
  href: string;
  className?: string;
  title?: string;
  ariaCurrent?: "page" | undefined;
  sinSalto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} title={title} aria-current={ariaCurrent} scroll={!sinSalto}>
      {children}
      <Indicador />
    </Link>
  );
}
