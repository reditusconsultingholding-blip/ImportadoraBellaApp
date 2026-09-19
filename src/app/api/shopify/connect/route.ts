import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageConexiones } from "@/lib/permissions";
import {
  verifyShopifyConnection,
  hasShopifyAppCredentials,
  normalizeShopDomain,
  ShopifyDominioInvalido,
} from "@/lib/integrations/shopify";
import { syncShopifyStore } from "@/lib/integrations/shopify-sync";
import { frenarUsuario } from "@/lib/limite";
import { z } from "zod";
import { leerCuerpo } from "@/lib/validacion";
import { mensajeSeguro } from "@/lib/respuesta";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  // Sale a la API de Shopify con credenciales.
  const frenado = frenarUsuario("conectar", session.userId, 10, 10 * 60 * 1000);
  if (frenado) return frenado;
  if (!canManageConexiones(session.role)) {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const lectura = await leerCuerpo(
    req,
    z.object({ shopDomain: z.string().max(255).optional(), accessToken: z.string().max(500).optional() }),
  );
  if (!lectura.ok) return lectura.respuesta;
  const { shopDomain, accessToken } = lectura.datos;
  if (!shopDomain?.trim()) {
    return NextResponse.json({ error: "Falta el dominio de la tienda." }, { status: 400 });
  }

  // El dominio se valida antes de llamar a nada: el servidor le manda a ese
  // dominio las credenciales de la app. Ver normalizeShopDomain.
  let dominio: string;
  try {
    dominio = normalizeShopDomain(shopDomain);
  } catch (err) {
    if (err instanceof ShopifyDominioInvalido) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

  // El token puede venir vacío: si la app "Jarvin Panal" está configurada por
  // variables de entorno (SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET), el token
  // lo pide y lo renueva solo el cliente de Shopify.
  const token = accessToken?.trim() || null;
  if (!token && !hasShopifyAppCredentials()) {
    return NextResponse.json(
      {
        error:
          "Pegá el Admin API access token, o configurá SHOPIFY_CLIENT_ID y SHOPIFY_CLIENT_SECRET para que el token se renueve solo.",
      },
      { status: 400 }
    );
  }

  let shopName: string | undefined;
  try {
    const result = await verifyShopifyConnection(dominio, token);
    shopName = result.shopName;
  } catch (err) {
    return NextResponse.json(
      {
        error: "No se pudo verificar la tienda — revisa el dominio y las credenciales.",
        detail: mensajeSeguro(err),
      },
      { status: 400 }
    );
  }

  const store = await db.shopifyStore.upsert({
    where: {
      organizationId_shopDomain: {
        organizationId: session.organizationId,
        shopDomain: dominio,
      },
    },
    create: {
      organizationId: session.organizationId,
      shopDomain: dominio,
      accessToken: token,
      connectedAt: new Date(),
    },
    update: {
      accessToken: token,
      connectedAt: new Date(),
    },
  });

  try {
    const { ordersSynced } = await syncShopifyStore(store.id);
    return NextResponse.json({ ok: true, shopName, ordersSynced });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      shopName,
      warning: "Se conectó, pero la primera sincronización falló.",
      detail: mensajeSeguro(err),
    });
  }
}
