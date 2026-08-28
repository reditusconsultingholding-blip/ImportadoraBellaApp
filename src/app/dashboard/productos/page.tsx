import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPipeline, canManagePipeline } from "@/lib/permissions";
import ProductBoard, { type BoardItem } from "./product-board";
import ProductDirectory from "./directory";
import CatalogPicker from "../catalog-picker";
import { getDirectory } from "@/lib/product-directory";
import { resolveRange } from "@/lib/date-range";
import { puedeDecidir } from "@/lib/product-actions";

const DONE = new Set(["REALIZADO", "EDITADO", "TESTEADO"]);

// Camino desde la raíz hasta la carpeta abierta, para las migas de pan.
// Se sube por parentId con un tope de profundidad: si alguna vez quedara un
// ciclo en la base, esto no cuelga la página.
async function breadcrumb(folderId: string | null, organizationId: string) {
  const path: { id: string; name: string }[] = [];
  let cursor = folderId;
  let guard = 0;
  while (cursor && guard++ < 25) {
    const folder = await db.productFolder.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, parentId: true, organizationId: true },
    });
    if (!folder || folder.organizationId !== organizationId) break;
    path.unshift({ id: folder.id, name: folder.name });
    cursor = folder.parentId;
  }
  return path;
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ carpeta?: string; ficha?: string; vista?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canAccessPipeline(session.role)) redirect("/dashboard");

  const canManage = canManagePipeline(session.role);
  const { carpeta, ficha, vista } = await searchParams;

  // Una carpeta de otra organización se trata como inexistente: se abre la raíz.
  let folderId: string | null = null;
  if (carpeta) {
    const found = await db.productFolder.findUnique({
      where: { id: carpeta },
      select: { id: true, organizationId: true },
    });
    if (found && found.organizationId === session.organizationId) folderId = found.id;
  }

  const [folders, products, notes, path] = await Promise.all([
    db.productFolder.findMany({
      where: { organizationId: session.organizationId, parentId: folderId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { children: true, products: true, notes: true } } },
    }),
    db.product.findMany({
      where: { organizationId: session.organizationId, folderId, archived: false },
      orderBy: { createdAt: "asc" },
      include: {
        requirements: {
          where: canManage ? {} : { ownerId: session.userId },
          select: { status: true, cpa: true },
        },
      },
    }),
    db.boardNote.findMany({
      where: { organizationId: session.organizationId, folderId },
      orderBy: { createdAt: "asc" },
      include: {
        assignee: { select: { name: true } },
        _count: { select: { comments: true } },
      },
    }),
    breadcrumb(folderId, session.organizationId),
  ]);

  const items: BoardItem[] = [
    ...folders.map((f) => ({
      kind: "folder" as const,
      id: f.id,
      x: f.positionX,
      y: f.positionY,
      color: f.color,
      name: f.name,
      counts: {
        folders: f._count.children,
        products: f._count.products,
        notes: f._count.notes,
      },
    })),
    ...products.map((p) => {
      const done = p.requirements.filter((r) => DONE.has(r.status)).length;
      const tested = p.requirements.filter((r) => r.status === "TESTEADO" && r.cpa != null);
      return {
        kind: "product" as const,
        id: p.id,
        x: p.positionX,
        y: p.positionY,
        color: null,
        name: p.name,
        code: p.code,
        cpaTarget: p.cpaTarget,
        salePrice: p.salePrice,
        unitCost: p.unitCost,
        stats: {
          done,
          pending: p.requirements.length - done,
          good: tested.filter((r) => (r.cpa as number) <= p.cpaTarget).length,
          bad: tested.filter((r) => (r.cpa as number) > p.cpaTarget).length,
        },
      };
    }),
    ...notes.map((n) => ({
      kind: "note" as const,
      id: n.id,
      x: n.positionX,
      y: n.positionY,
      color: n.color,
      title: n.title,
      body: n.body,
      status: n.status,
      priority: n.priority,
      dueDate: n.dueDate ? n.dueDate.toISOString().slice(0, 10) : null,
      format: n.format,
      assigneeName: n.assignee?.name ?? null,
      commentCount: n._count.comments,
    })),
  ];

  // Para el selector de responsable y para saber a quién se puede mencionar.
  const people = await db.user.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, avatarUrl: true },
  });

  // El directorio es la vista por defecto. El tablero sigue estando, pero para
  // mirar cincuenta productos y encontrar el que se está yendo de precio hace
  // falta una lista que se pueda buscar y ordenar, no un lienzo.
  const enTablero = vista === "tablero";
  const directorio = enTablero
    ? null
    : await getDirectory(session.organizationId, resolveRange("30d"));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold">Productos</h1>
          <p className="mt-1 text-sm text-muted">
            {enTablero
              ? "El catálogo como tablero: arma carpetas, mete productos adentro y anota ideas al lado. Arrastra cualquier tarjeta — la posición queda guardada para todo el equipo."
              : "Todo lo que se está siguiendo, con su pulso, su economía y sus creativos. Busca por nombre o por el código que usan las campañas."}
          </p>
        </div>

        <nav className="flex shrink-0 gap-1.5">
          {[
            { id: "directorio", label: "Directorio" },
            { id: "tablero", label: "Tablero" },
          ].map((v) => {
            const activo = enTablero ? v.id === "tablero" : v.id === "directorio";
            return (
              <Link
                key={v.id}
                href={`/dashboard/productos?vista=${v.id}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  activo
                    ? "border-accent bg-good-bg text-accent-strong"
                    : "border-border text-muted hover:border-border-strong hover:text-foreground"
                }`}
              >
                {v.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {directorio ? (
        <>
          {canManage && <CatalogPicker />}
          <ProductDirectory
            rows={directorio.rows}
            carpetas={directorio.carpetas}
            totales={directorio.totales}
            puedeGestionar={canManage}
            pendientes={directorio.pendientes}
            equipo={directorio.equipo}
            puedeDecidir={puedeDecidir(session.role)}
          />
        </>
      ) : (
        <ProductBoard
          items={items}
          folderId={folderId}
          path={path}
          canManage={canManage}
          people={people}
          openNoteId={ficha ?? null}
          parentId={path.length > 1 ? path[path.length - 2].id : null}
        />
      )}
    </div>
  );
}
