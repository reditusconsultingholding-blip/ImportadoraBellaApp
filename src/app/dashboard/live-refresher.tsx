"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Vuelve a pedir los datos del server (dashboard, header, conexiones) sin
// que la persona tenga que recargar la página a mano.
export default function LiveRefresher({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
