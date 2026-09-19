"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSondeo } from "./usar-sondeo";

// Vuelve a pedir los datos del server (dashboard, header, conexiones) sin
// que la persona tenga que recargar la página a mano.
//
// Cada 2 minutos y solo con la pestaña a la vista. Antes era cada 30 segundos
// en TODAS las pestañas abiertas, visibles o no: cada una volvía a armar la
// pantalla entera en el servidor aunque los datos solo cambian cuando corre la
// sincronización, cada 5 minutos. Al volver a una pestaña que quedó atrás se
// refresca en el acto.
export default function LiveRefresher({ intervalMs = 120_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const refrescar = useCallback(() => router.refresh(), [router]);
  useSondeo(refrescar, intervalMs, { alMontar: false });
  return null;
}
