import LinkCargando from "./link-cargando";
import type { Platform } from "@/generated/prisma/client";

// Los logos van dibujados como SVG, no como imagen ni emoji: se reconocen de
// un vistazo, toman el color del texto y no dependen de cargar un archivo.
const ICONS: Record<Platform, React.ReactNode> = {
  META: (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 12.4c0-3.6 1.8-6.4 4-6.4 1.5 0 2.4 1 3 2.2 1 1.9 1.4 3.3 2.4 4.9.6 1 1.2 1.4 2 1.4 1.5 0 2.3-1.3 2.3-3.4 0-2.6-1.3-5.1-3.3-5.1-1.6 0-2.9 1.3-4 3.3-1 1.9-2 4-3.6 4C4.4 13.3 3 12.9 3 12.4z" />
    </svg>
  ),
  TIKTOK: (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M12 2.5v9.2a3.3 3.3 0 1 1-2.6-3.2" />
      <path d="M12 2.5c.4 2 1.9 3.4 4 3.5" />
    </svg>
  ),
};

const TABS: { value: Platform; label: string; short: string }[] = [
  { value: "META", label: "Meta", short: "Facebook + Instagram" },
  { value: "TIKTOK", label: "TikTok", short: "TikTok Ads" },
];

// El período viaja en el enlace. Sin esto, elegir "12 meses" y despues cambiar
// de plataforma devolvia el panel al período por defecto sin avisar, y los
// numeros nuevos se leian como si fueran los de doce meses.
export default function PlatformTabs({
  active,
  rango,
  desde,
  hasta,
}: {
  active: Platform;
  rango: string;
  desde?: string;
  hasta?: string;
}) {
  const extra =
    rango === "personalizado" && desde && hasta
      ? `&rango=personalizado&desde=${desde}&hasta=${hasta}`
      : `&rango=${rango}`;

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
      {TABS.map((tab) => {
        const on = active === tab.value;
        return (
          <LinkCargando
            key={tab.value}
            href={`/dashboard?platform=${tab.value}${extra}`}
            ariaCurrent={on ? "page" : undefined}
            title={tab.short}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
              on
                ? "bg-surface text-foreground shadow-[0_1px_2px_0_rgb(26_26_26_/_0.08)]"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span className={on ? "text-accent" : "text-muted"}>{ICONS[tab.value]}</span>
            {tab.label}
          </LinkCargando>
        );
      })}
    </div>
  );
}
