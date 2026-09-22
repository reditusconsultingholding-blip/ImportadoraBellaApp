import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import TableroNotion from "./tablero-notion";
import LotesCruzados from "./lotes-cruzados";
import CalendarioContenido from "./calendario-contenido";
import GestionCampanas from "./gestion-campanas";
import PanelRendimiento from "./panel-rendimiento";
import Requerimientos from "./requerimientos";
import { EncabezadoSeccion } from "../encabezado-seccion";
import { productosPautadosRecientes } from "@/lib/pautados";
import { resolveRange, toInputValue } from "@/lib/date-range";
import { piezasSinClasificar } from "@/lib/piezas-sin-clasificar";
import RangoContenido from "./rango-contenido";

const VISTAS = [
  "calendario",
  "tablero",
  "requerimientos",
  "lotes",
  "campanas",
  "rendimiento",
] as const;
type Vista = (typeof VISTAS)[number];
function esVista(v: string | undefined): v is Vista {
  return Boolean(v && (VISTAS as readonly string[]).includes(v));
}

const TABS: { id: Vista; label: string }[] = [
  { id: "calendario", label: "Calendario" },
  { id: "tablero", label: "Día a día" },
  // Va después del día a día y antes de los lotes: es el orden en que se
  // trabaja —qué hay para hoy, qué piezas lo componen, cómo se agrupan—.
  { id: "requerimientos", label: "Requerimientos" },
  // "Lotes" a secas no le decía nada a nadie. Es la Matrix de rondas del
  // archivo de Super Ads, con otro nombre: cuatro piezas que salen juntas a
  // testear, con formato, ángulo y nivel de consciencia distintos entre sí.
  // El problema no era la pantalla, era que nadie sabía que era eso.
  { id: "lotes", label: "Lotes · Matrix de rondas" },
  { id: "campanas", label: "Gestión de campañas" },
  // Solo dirección: se filtra al dibujar las pestañas.
  { id: "rendimiento", label: "Rendimiento" },
];

export default async function ContenidoPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; rango?: string; desde?: string; hasta?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) {
    return (
      <div className="bg-surface border border-border rounded p-6 max-w-lg">
        <p className="text-sm text-muted">
          Todavía no tienes un rol asignado. Pídele a un administrador que te asigne
          &quot;Director operativo&quot; o &quot;Editor&quot; desde Usuarios.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const { vista: vistaRaw } = params;

  // UN período para todas las pestañas. Cada una traía el suyo —el día a día
  // abría en hoy, rendimiento tenía 7/30/90 días, lotes y campañas no tenían
  // ninguno— y la misma pregunta se contestaba distinto en cada pantalla.
  const range = resolveRange(params.rango, params.desde, params.hasta);
  const desde = toInputValue(range.from);
  const hasta = toInputValue(range.to);
  const canManage = canManagePipeline(session.role);
  // Rendimiento es solo de dirección: quien entra por la URL sin permiso cae
  // en el calendario en vez de ver una pantalla que no le corresponde.
  const pedida: Vista = esVista(vistaRaw) ? vistaRaw : "calendario";
  const vista: Vista = pedida === "rendimiento" && !canManage ? "calendario" : pedida;

  const users = await db.user.findMany({
    where: { organizationId: session.organizationId, role: { in: ["OWNER", "DIRECTOR", "EDITOR"] } },
    // `role` lo pide el tipo UserOption que comparten el formulario y la ficha
    // de requerimientos.
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  // Se usa en varias pestañas (tablero, requerimientos, gestión de campañas):
  // una sola consulta, no una por pestaña.
  const products =
    vista === "tablero" ||
    vista === "campanas" ||
    vista === "requerimientos" ||
    vista === "lotes"
      ? await db.product.findMany({
          where: { organizationId: session.organizationId, archived: false },
          select: { id: true, code: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  // Para Requerimientos, además, quién lleva cada producto y sus ángulos
  // propios: las tarjetas muestran a los responsables, y la tabla de cada
  // producto ofrece sus ángulos junto a los de Super Ads.
  const fichas =
    vista === "requerimientos"
      ? await db.product.findMany({
          where: { organizationId: session.organizationId, archived: false },
          select: {
            id: true,
            angulosPropios: true,
            responsables: { select: { user: { select: { id: true, name: true } } } },
          },
        })
      : [];
  // Cuáles se están pautando ahora mismo. Es con lo que abren las tarjetas:
  // el catálogo entero son ciento y pico productos y casi ninguno está vivo.
  // Las piezas a medio cargar del período. Un editor ve LAS SUYAS: una lista
  // de piezas de otros no se arregla sola y solo hace ruido. Dirección ve
  // todas, que es lo que Emilia pidió poder vigilar.
  const sinClasificar =
    vista === "requerimientos"
      ? await piezasSinClasificar(
          session.organizationId,
          range.from,
          range.to,
          canManage ? undefined : session.userId,
        )
      : [];

  const pautados = new Set(
    vista === "requerimientos" ? await productosPautadosRecientes(session.organizationId) : [],
  );
  const productosConFicha = products.map((p) => {
    const f = fichas.find((x) => x.id === p.id);
    return {
      ...p,
      angulosPropios: f?.angulosPropios ?? [],
      responsables: f?.responsables.map((r) => r.user) ?? [],
      pautado: pautados.has(p.id),
    };
  });

  let tablero: React.ReactNode = null;
  if (vista === "tablero") {
    // El tablero se trae sus propias filas por la API en vez de recibirlas ya
    // dibujadas. Es lo que le permite guardar cada celda al salir del campo y
    // mostrarlo al instante: con las filas fijadas en el HTML del servidor,
    // ver el propio cambio obligaría a recargar la página, que es justo la
    // fricción que esta pantalla vino a sacar.
    tablero = (
      <TableroNotion
        canManage={canManage}
        currentUserId={session.userId}
        users={users}
        products={products}
        desde={desde}
        hasta={hasta}
        periodoElegido={Boolean(params.rango)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <EncabezadoSeccion
        eyebrow="Producción"
        titulo="Contenido"
        descripcion="El calendario de entregas, el día a día del equipo, los lotes de contenido, la gestión de campañas y el rendimiento de cada integrante — en un solo lugar, sin Notion ni WhatsApp."
        acciones={
          canManage ? (
            <Link
              href="/dashboard/contenido/importar"
              className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-white/85 transition hover:bg-white/10"
            >
              Traer datos de Notion →
            </Link>
          ) : null
        }
      />

      <div className="flex flex-col gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap gap-1.5">
        {TABS.filter((t) => t.id !== "rendimiento" || canManage).map((t) => {
          const activo = vista === t.id;
          return (
            <Link
              key={t.id}
              // El período se conserva al cambiar de pestaña: elegirlo y
              // perderlo al mirar otra cosa es peor que no tenerlo.
              href={`/dashboard/contenido?${new URLSearchParams({ vista: t.id, rango: range.id, ...(range.id === "personalizado" ? { desde, hasta } : {}) }).toString()}`}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activo
                  ? "border-accent bg-good-bg text-accent-strong"
                  : "border-border text-muted hover:border-border-strong hover:text-foreground"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        </div>

        {/* El calendario elige su propio mes adentro, así que el selector de
            período no le aplica: ponerlo ahí diría que filtra algo que no
            filtra. */}
        {vista !== "calendario" && (
          <RangoContenido vista={vista} activo={range.id} desde={desde} hasta={hasta} />
        )}
      </div>

      {vista === "calendario" ? (
        <CalendarioContenido />
      ) : vista === "tablero" ? (
        tablero
      ) : vista === "requerimientos" ? (
        <Requerimientos
          canManage={canManage}
          currentUserId={session.userId}
          users={users}
          products={productosConFicha}
          sinClasificar={sinClasificar}
          desde={desde}
          hasta={hasta}
        />
      ) : vista === "lotes" ? (
        <LotesCruzados canManage={canManage} products={products} desde={desde} hasta={hasta} />
      ) : vista === "campanas" ? (
        <GestionCampanas products={products} desde={desde} hasta={hasta} />
      ) : (
        <PanelRendimiento desde={desde} hasta={hasta} />
      )}
    </div>
  );
}
