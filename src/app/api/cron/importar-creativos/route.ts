import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cronAuthorized } from "@/lib/cron-auth";
import { normalizar } from "@/lib/product-code";
import {
  AD_TYPES,
  ANGLES,
  AWARENESS_LEVELS,
  ESTADOS_CREATIVO,
  MARKET_ORIGINS,
  PHASES,
  PROXIMAS_ACCIONES,
  REQUIREMENT_STATUSES,
  STATUS_LABEL,
  VISUAL_FORMATS,
} from "@/lib/pipeline-options";
import type { RequirementStatus } from "@/generated/prisma/client";

// Importa los creativos de la planilla del equipo.
//
// La planilla y la app tienen las mismas columnas, pero los valores vienen
// tipeados a mano: "UGC con Persona" contra "UGC con persona", "Frustración
// Acumulada" contra "Frustración acumulada". Se emparejan sin acentos ni
// mayúsculas contra las listas oficiales; lo que no matchea se guarda tal cual
// y se reporta, en vez de descartarse en silencio.

export const maxDuration = 600;

type Entrada = {
  fecha?: string | null;
  producto?: string;
  nombre?: string;
  tipoAnuncio?: string;
  fase?: string;
  formatoVisual?: string;
  angulo?: string;
  awareness?: string;
  mercado?: string;
  editor?: string;
  situacion?: string;
  postTiktok?: string;
  postFb?: string;
  link?: string;
  videoOriginal?: string;
  id1?: string;
  id2?: string;
  hookRate?: number | null;
  ctr?: number | null;
  holdRate?: number | null;
  compras?: number | null;
  cpa?: number | null;
  frecuencia?: number | null;
  cpm?: number | null;
  estado?: string;
  proximaAccion?: string;
  notas?: string;
};

/** Empareja un valor tipeado a mano contra una lista oficial. */
function contra(valor: string | undefined, lista: readonly string[]): string {
  const v = normalizar(valor ?? "");
  if (!v) return "";
  const exacto = lista.find((o) => normalizar(o) === v);
  if (exacto) return exacto;
  // Segundo intento: que uno contenga al otro. Cubre "UGC Persona" contra
  // "UGC con persona" sin abrir la puerta a emparejar cualquier cosa.
  const parecido = lista.find((o) => {
    const n = normalizar(o);
    return n.includes(v) || v.includes(n);
  });
  return parecido ?? "";
}

function situacionDe(valor: string | undefined): RequirementStatus {
  const v = normalizar(valor ?? "");
  if (!v) return "PENDIENTE";
  const porClave = REQUIREMENT_STATUSES.find((s) => normalizar(s) === v);
  if (porClave) return porClave as RequirementStatus;
  const porEtiqueta = REQUIREMENT_STATUSES.find((s) => normalizar(STATUS_LABEL[s] ?? "") === v);
  return (porEtiqueta as RequirementStatus) ?? "PENDIENTE";
}

const soloUrl = (v?: string) => {
  const s = (v ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : null;
};

export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { creativos } = (await req.json()) as { creativos?: Entrada[] };
  const entradas = creativos ?? [];
  if (entradas.length === 0) {
    return NextResponse.json({ error: "No vino ningún creativo." }, { status: 400 });
  }

  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) return NextResponse.json({ error: "No hay organización." }, { status: 409 });

  const [productos, usuarios, existentes] = await Promise.all([
    db.product.findMany({
      where: { organizationId: org.id },
      select: { id: true, code: true, name: true },
    }),
    db.user.findMany({
      where: { organizationId: org.id },
      select: { id: true, name: true },
    }),
    // Para no duplicar si se corre dos veces: el nombre de la pieza es único
    // dentro de la planilla.
    db.requirement.findMany({
      where: { organizationId: org.id },
      select: { id: true, adName: true },
    }),
  ]);

  const porNombreProducto = new Map(productos.map((p) => [normalizar(p.name), p]));
  const porCodigo = new Map(productos.map((p) => [p.code, p]));
  const porNombreUsuario = new Map(usuarios.map((u) => [normalizar(u.name), u]));
  const yaEstan = new Map(existentes.map((r) => [normalizar(r.adName), r.id]));

  let creados = 0;
  let actualizados = 0;
  const sinProducto = new Set<string>();
  const sinEditor = new Set<string>();
  const valoresRaros = new Set<string>();

  for (const e of entradas) {
    const nombre = (e.nombre ?? "").trim();
    if (!nombre) continue;

    // El producto viene por nombre. Se prueba por nombre normalizado y por
    // código, porque el equipo usa los dos indistintamente.
    const clave = normalizar(e.producto ?? "");
    const producto =
      porNombreProducto.get(clave) ??
      porCodigo.get((e.producto ?? "").trim()) ??
      productos.find((p) => normalizar(p.name).includes(clave) && clave.length >= 3) ??
      null;
    if (!producto && e.producto) sinProducto.add(e.producto);

    const editor = porNombreUsuario.get(normalizar(e.editor ?? "")) ?? null;
    if (!editor && e.editor) sinEditor.add(e.editor);

    const adType = contra(e.tipoAnuncio, AD_TYPES);
    const phase = contra(e.fase, PHASES);
    const visualFormat = contra(e.formatoVisual, VISUAL_FORMATS);
    const angle = contra(e.angulo, ANGLES);
    const awarenessLevel = contra(e.awareness, AWARENESS_LEVELS);
    const marketOrigin = contra(e.mercado, MARKET_ORIGINS);
    const estado = contra(e.estado, ESTADOS_CREATIVO);
    const nextAction = contra(e.proximaAccion, PROXIMAS_ACCIONES);

    // Lo que se tipeó y no está en ninguna lista se anota, para poder decidir
    // si falta una opción o fue un error de tipeo.
    for (const [crudo, limpio] of [
      [e.tipoAnuncio, adType],
      [e.formatoVisual, visualFormat],
      [e.angulo, angle],
      [e.estado, estado],
      [e.proximaAccion, nextAction],
    ] as const) {
      if ((crudo ?? "").trim() && !limpio) valoresRaros.add((crudo ?? "").trim());
    }

    const datos = {
      organizationId: org.id,
      productId: producto?.id ?? null,
      date: e.fecha ? new Date(`${e.fecha}T12:00:00.000Z`) : new Date(),
      adName: nombre.slice(0, 300),
      adType,
      phase,
      visualFormat,
      angle,
      awarenessLevel,
      marketOrigin,
      ownerId: editor?.id ?? null,
      status: situacionDe(e.situacion),
      estado: estado || null,
      externalId1: (e.id1 ?? "").trim() || null,
      externalId2: (e.id2 ?? "").trim() || null,
      tiktokPostLink: soloUrl(e.postTiktok) ?? soloUrl(e.link),
      fbPostLink: soloUrl(e.postFb),
      originalVideoLink: soloUrl(e.videoOriginal),
      hookRate: e.hookRate ?? null,
      ctr: e.ctr ?? null,
      holdRate: e.holdRate ?? null,
      purchases: e.compras == null ? null : Math.round(e.compras),
      cpa: e.cpa ?? null,
      frequency: e.frecuencia ?? null,
      cpm: e.cpm ?? null,
      nextAction: nextAction || null,
      notes: (e.notas ?? "").trim() || null,
    };

    const existente = yaEstan.get(normalizar(nombre));
    if (existente) {
      await db.requirement.update({ where: { id: existente }, data: datos });
      actualizados += 1;
    } else {
      const creado = await db.requirement.create({ data: datos, select: { id: true } });
      yaEstan.set(normalizar(nombre), creado.id);
      creados += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    recibidos: entradas.length,
    creados,
    actualizados,
    sinProducto: [...sinProducto],
    sinEditor: [...sinEditor],
    valoresQueNoMatchearon: [...valoresRaros].slice(0, 30),
  });
}
