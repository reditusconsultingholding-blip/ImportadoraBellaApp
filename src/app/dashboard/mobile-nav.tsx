"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Barra superior con el menú, solo en pantallas chicas. La barra lateral fija
// de 240px es correcta en escritorio y en un teléfono se come media pantalla,
// así que ahí pasa a ser un cajón que se abre.
export default function MobileNav({
  brand,
  children,
}: {
  brand: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Al navegar se cierra solo: si no, quedaría el cajón abierto tapando la
  // pantalla a la que se acaba de entrar. Se ajusta durante el render y no
  // desde un efecto: en un efecto, la pantalla nueva se pinta un cuadro con el
  // cajón todavía encima.
  const [ultimaRuta, setUltimaRuta] = useState(pathname);
  if (pathname !== ultimaRuta) {
    setUltimaRuta(pathname);
    setOpen(false);
  }

  // Con el cajón abierto no se scrollea lo de atrás.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div className="flex items-center gap-3 bg-brand-navy px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir el menú"
          // 44px de lado: el mínimo para que un dedo lo acierte sin pelear.
          className="grid h-11 w-11 shrink-0 place-items-center rounded text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">{brand}</div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
          />
          <aside className="relative flex h-full w-[17rem] max-w-[85vw] flex-col overflow-y-auto bg-brand-navy">
            <div className="flex items-start justify-between px-5 pt-5 pb-1">
              <div className="min-w-0">{brand}</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar el menú"
                className="grid h-9 w-9 shrink-0 place-items-center rounded text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>
            {children}
          </aside>
        </div>
      )}
    </>
  );
}
