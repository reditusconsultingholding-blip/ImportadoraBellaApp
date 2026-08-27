"use client";

import { useState } from "react";
import PasswordInput from "@/components/password-input";
import { useRouter } from "next/navigation";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  canViewPayroll: boolean;
  mustChangePassword: boolean;
  position: string | null;
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Administrador",
  DIRECTOR: "Director operativo",
  EDITOR: "Editor / Creador",
  PENDING: "Pendiente de rol",
};

const ROLE_ORDER = ["EDITOR", "DIRECTOR", "OWNER", "PENDING"] as const;

const inputClass =
  "w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent";
const labelClass = "block text-xs font-medium text-muted mb-1";

export default function UsersManager({
  currentUserId,
  canGrantPayroll,
  initialUsers,
}: {
  currentUserId: string;
  // Solo quien ya ve la nómina puede dar o quitar ese permiso.
  canGrantPayroll: boolean;
  initialUsers: UserRow[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Alta
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("EDITOR");
  const [authCode, setAuthCode] = useState("");

  // Edición
  const [draft, setDraft] = useState<{
    name: string;
    email: string;
    role: string;
    canViewPayroll: boolean;
    newPassword: string;
  } | null>(null);

  function startEdit(u: UserRow) {
    setError(null);
    setNotice(null);
    setEditingId(u.id);
    setDraft({
      name: u.name,
      email: u.email,
      role: u.role,
      canViewPayroll: u.canViewPayroll,
      newPassword: "",
    });
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role, authCode }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el usuario.");
      return;
    }

    setName("");
    setEmail("");
    setPassword("");
    setRole("EDITOR");
    setAuthCode("");
    setOpen(false);
    router.refresh();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !draft) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    const payload: Record<string, unknown> = {
      name: draft.name,
      email: draft.email,
      role: draft.role,
    };
    if (canGrantPayroll) payload.canViewPayroll = draft.canViewPayroll;
    if (draft.newPassword) payload.newPassword = draft.newPassword;

    const res = await fetch(`/api/users/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudieron guardar los cambios.");
      return;
    }

    setUsers((prev) =>
      prev.map((u) => (u.id === editingId ? { ...u, ...data.user, position: u.position } : u))
    );
    setNotice(
      draft.newPassword
        ? "Cambios guardados. La persona va a tener que elegir una contraseña nueva al entrar."
        : "Cambios guardados."
    );
    setEditingId(null);
    setDraft(null);
    router.refresh();
  }

  async function deleteUser(id: string) {
    if (!confirm("¿Eliminar este usuario? No va a poder volver a entrar al panel.")) return;

    setDeletingId(id);
    setError(null);
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingId(null);

    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar el usuario.");
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm text-good bg-good-bg border border-good/25 rounded px-3 py-2">
          {notice}
        </p>
      )}

      <div className="bg-surface border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="px-5 py-3">Persona</th>
              <th className="px-5 py-3">Rol</th>
              <th className="px-5 py-3">Nómina</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border align-top">
                {editingId === u.id && draft ? (
                  <td colSpan={4} className="px-5 py-4 bg-surface-2">
                    <form onSubmit={saveEdit} className="flex flex-col gap-3 max-w-xl">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <label className="block">
                          <span className={labelClass}>Nombre</span>
                          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            required
            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Correo</span>
                          <input
            type="email"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            required
            className={inputClass}
                          />
                        </label>
                        <label className="block">
                          <span className={labelClass}>Rol</span>
                          <select
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
            className={inputClass}
                          >
                            {ROLE_ORDER.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className={labelClass}>Contraseña nueva (opcional)</span>
                          <PasswordInput
            value={draft.newPassword}
            onChange={(e) => setDraft({ ...draft, newPassword: e.target.value })}
            minLength={8}
            autoComplete="new-password"
            placeholder="dejala vacía para no cambiarla"
            className={inputClass}
                          />
                        </label>
                      </div>

                      <label
            className={`flex items-start gap-2 text-sm ${
                          canGrantPayroll ? "" : "opacity-60"
                        }`}
                      >
                        <input
            type="checkbox"
                          disabled={!canGrantPayroll}
                          checked={draft.canViewPayroll}
            onChange={(e) => setDraft({ ...draft, canViewPayroll: e.target.checked })}
            className="mt-0.5"
                        />
                        <span>
                          Puede ver la nómina
                          <span className="block text-xs text-muted">
                            {canGrantPayroll
                              ? "Ve los sueldos de todo el equipo. Dáselo solo a quien deba verlos."
                              : "Solo alguien que ya ve la nómina puede dar este permiso."}
                          </span>
                        </span>
                      </label>

                      <div className="flex gap-2">
                        <button
            type="submit"
                          disabled={busy}
            className="text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-accent-strong transition disabled:opacity-60"
                        >
                          {busy ? "Guardando…" : "Guardar cambios"}
                        </button>
                        <button
            type="button"
                          onClick={() => {
                            setEditingId(null);
                            setDraft(null);
                          }}
            className="text-sm text-muted hover:text-foreground transition px-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-5 py-3">
                      <p className="font-medium">
                        {u.name}
                        {u.id === currentUserId && (
                          <span className="text-muted font-normal"> (vos)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted">{u.email}</p>
                      {u.position && <p className="text-xs text-muted">{u.position}</p>}
                      {u.mustChangePassword && (
                        <p className="text-xs text-warning mt-0.5">
                          Todavía no eligió su contraseña
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs px-2 py-1 rounded bg-surface-2 text-muted whitespace-nowrap">
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {u.canViewPayroll ? (
                        <span className="text-xs px-2 py-1 rounded bg-good-bg text-good">Sí</span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button
                        onClick={() => startEdit(u)}
            className="text-xs font-medium border border-border rounded px-2.5 py-1 hover:bg-surface-2 transition"
                      >
                        Editar
                      </button>
                      {u.id !== currentUserId && (
                        <button
                          onClick={() => deleteUser(u.id)}
                          disabled={deletingId === u.id}
            className="ml-2 text-xs text-critical hover:underline disabled:opacity-60"
                        >
                          {deletingId === u.id ? "Eliminando…" : "Eliminar"}
                        </button>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="self-start text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-accent-strong transition"
        >
          Nuevo usuario
        </button>
      ) : (
        <form
          onSubmit={createUser}
          className="bg-surface border border-border rounded p-5 flex flex-col gap-3 max-w-xl"
        >
          <h2 className="font-semibold text-sm">Nuevo usuario</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className={labelClass}>Nombre</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Correo</span>
              <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Contraseña</span>
              <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="mínimo 6 caracteres"
            className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Rol</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
                {ROLE_ORDER.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block border-t border-border pt-3">
            <span className={labelClass}>Código de autorización</span>
            <PasswordInput
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            required
            inputMode="numeric"
            autoComplete="off"
            placeholder="requerido para crear la cuenta"
            className={inputClass}
            />
            <span className="block text-xs text-muted mt-1">
              Sin este código no se crea la cuenta, aunque alguien llegue a esta pantalla.
            </span>
          </label>
          <div className="flex gap-2">
            <button
            type="submit"
              disabled={busy}
            className="text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-accent-strong transition disabled:opacity-60"
            >
              {busy ? "Creando…" : "Crear usuario"}
            </button>
            <button
            type="button"
              onClick={() => setOpen(false)}
            className="text-sm text-muted hover:text-foreground transition px-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
