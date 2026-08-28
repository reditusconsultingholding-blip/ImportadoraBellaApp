import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManagePipeline } from "@/lib/permissions";
import { notifyMentions } from "@/lib/chat";

// La ficha de una pieza de contenido: estado, fecha, formato, duración,
// responsable, links y su conversación.

const STATUSES = ["IDEA", "GUION", "GRABACION", "EDICION", "REVISION", "APROBADO", "PUBLICADO"];
const PRIORITIES = ["BAJA", "MEDIA", "ALTA"];

type LinkRow = { label: string; url: string };

// Solo http(s). Sin esto, un `javascript:` guardado por alguien se ejecutaría
// al hacer clic desde la ficha de otra persona.
function cleanLinks(value: unknown): LinkRow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: LinkRow[] = [];
  for (const raw of value.slice(0, 20)) {
    if (!raw || typeof raw !== "object") continue;
    const url = String((raw as LinkRow).url ?? "").trim();
    if (!/^https?:\/\/\S+$/i.test(url)) continue;
    rows.push({
      label: String((raw as LinkRow).label ?? "").trim().slice(0, 80) || url,
      url: url.slice(0, 2000),
    });
  }
  return rows;
}

async function loadNote(id: string, organizationId: string) {
  const note = await db.boardNote.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!note || note.organizationId !== organizationId) return null;
  return note;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  if (!(await loadNote(id, session.organizationId))) {
    return NextResponse.json({ error: "Ficha no encontrada." }, { status: 404 });
  }

  const note = await db.boardNote.findUniqueOrThrow({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, avatarUrl: true } },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      },
    },
  });

  return NextResponse.json({
    note: {
      id: note.id,
      title: note.title,
      body: note.body,
      status: note.status,
      priority: note.priority,
      dueDate: note.dueDate ? note.dueDate.toISOString().slice(0, 10) : null,
      format: note.format,
      durationSec: note.durationSec,
      assignee: note.assignee,
      links: (note.links as LinkRow[] | null) ?? [],
      comments: note.comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt.toISOString(),
        author: c.author,
        mine: c.authorId === session.userId,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  if (!canManagePipeline(session.role)) {
    return NextResponse.json({ error: "No tienes permiso para editar el catálogo." }, { status: 403 });
  }

  const { id } = await params;
  if (!(await loadNote(id, session.organizationId))) {
    return NextResponse.json({ error: "Ficha no encontrada." }, { status: 404 });
  }

  const b = (await req.json()) as Record<string, unknown>;

  // Un responsable de otra organización no se puede asignar.
  let assigneeId: string | null | undefined;
  if (b.assigneeId !== undefined) {
    if (!b.assigneeId) {
      assigneeId = null;
    } else {
      const person = await db.user.findUnique({
        where: { id: String(b.assigneeId) },
        select: { id: true, organizationId: true },
      });
      assigneeId = person?.organizationId === session.organizationId ? person.id : null;
    }
  }

  const links = cleanLinks(b.links);

  await db.boardNote.update({
    where: { id },
    data: {
      ...(typeof b.title === "string" ? { title: b.title.trim() || null } : {}),
      ...(typeof b.body === "string" && b.body.trim() ? { body: b.body.trim() } : {}),
      ...(typeof b.status === "string" && STATUSES.includes(b.status) ? { status: b.status } : {}),
      ...(typeof b.priority === "string" && PRIORITIES.includes(b.priority)
        ? { priority: b.priority }
        : {}),
      ...(b.dueDate !== undefined
        ? {
            dueDate:
              typeof b.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)
                ? new Date(`${b.dueDate}T00:00:00.000Z`)
                : null,
          }
        : {}),
      ...(b.format !== undefined ? { format: String(b.format).trim().slice(0, 60) || null } : {}),
      ...(b.durationSec !== undefined
        ? {
            durationSec:
              Number.isFinite(Number(b.durationSec)) && Number(b.durationSec) > 0
                ? Math.min(Math.round(Number(b.durationSec)), 36000)
                : null,
          }
        : {}),
      ...(assigneeId !== undefined ? { assigneeId } : {}),
      ...(links !== undefined ? { links } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

// Comentario en la ficha. Cualquiera del equipo puede comentar aunque no pueda
// editar el catálogo: opinar sobre una pieza no es lo mismo que cambiarla.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const { id } = await params;
  if (!(await loadNote(id, session.organizationId))) {
    return NextResponse.json({ error: "Ficha no encontrada." }, { status: 404 });
  }

  const { body } = (await req.json()) as { body?: string };
  const text = body?.trim();
  if (!text) return NextResponse.json({ error: "El comentario está vacío." }, { status: 400 });

  const comment = await db.boardNoteComment.create({
    data: { noteId: id, authorId: session.userId, body: text.slice(0, 4000) },
    include: { author: { select: { id: true, name: true, avatarUrl: true } } },
  });

  const note = await db.boardNote.findUniqueOrThrow({
    where: { id },
    select: { title: true, folderId: true },
  });

  await notifyMentions({
    body: text,
    authorId: session.userId,
    authorName: session.name,
    organizationId: session.organizationId,
    link: `/dashboard/productos?${note.folderId ? `carpeta=${note.folderId}&` : ""}ficha=${id}`,
    conversationTitle: note.title ? `la ficha "${note.title}"` : "una ficha de Productos",
  });

  return NextResponse.json({
    ok: true,
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: comment.author,
      mine: true,
    },
  });
}
