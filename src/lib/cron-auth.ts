import type { NextRequest } from "next/server";

/**
 * Autoriza una llamada a un endpoint de cron.
 *
 * Antes cada ruta hacía `if (process.env.CRON_SECRET && auth !== ...)`, que
 * falla ABIERTO: si la variable no está puesta, el endpoint queda público.
 * Y esos endpoints no son inocentes — uno sincroniza contra las APIs de
 * Meta/TikTok/Shopify (se puede usar para quemar cuota) y el otro genera y
 * guarda PDFs (se puede usar para llenar la base).
 *
 * Ahora falla CERRADO: sin secreto configurado, nadie entra.
 */
export function cronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;

  // Algunos programadores externos no permiten mandar encabezados propios;
  // para esos se acepta el secreto como parámetro de la URL.
  return req.nextUrl.searchParams.get("secret") === secret;
}
