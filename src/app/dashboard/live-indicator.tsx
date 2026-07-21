function nowLabel() {
  return new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Server Component a propósito: al no tener "use client", se vuelve a
// evaluar en cada router.refresh() disparado por LiveRefresher, así el
// reloj realmente cambia y confirma que la vista se está actualizando sola.
export default function LiveIndicator() {
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-good opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-good" />
      </span>
      En vivo · {nowLabel()}
    </span>
  );
}
