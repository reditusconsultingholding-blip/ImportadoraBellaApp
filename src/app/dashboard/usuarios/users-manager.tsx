"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Administrador",
  DIRECTOR: "Director operativo",
  EDITOR: "Editor / Creador",
  PENDING: "Pendiente de rol",
};

export default function UsersManager({
  currentUserId,
  initialUsers,
}: {
  currentUserId: string;
  initialUsers: UserRow[];
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"OWNER" | "DIRECTOR" | "EDITOR" | "PENDING">("EDITOR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo crear el usuario.");
      return;
    }

    setUsers((prev) => [...prev, data.user]);
    setName("");
    setEmail("");
    setPassword("");
    setRole("EDITOR");
    setOpen(false);
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
      <div className="bg-surface border border-border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-mono uppercase tracking-wide text-muted">
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Correo</th>
              <th className="px-5 py-3">Rol</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-5 py-3 font-medium">
                  {u.name}
                  {u.id === currentUserId && <span className="text-muted font-normal"> (vos)</span>}
                </td>
                <td className="px-5 py-3 text-muted">{u.email}</td>
                <td className="px-5 py-3">
                  <span className="font-mono text-xs px-2 py-1 rounded bg-surface-2 text-muted">
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  {u.id !== currentUserId && (
                    <button
                      onClick={() => deleteUser(u.id)}
                      disabled={deletingId === u.id}
                      className="text-xs text-critical hover:underline disabled:opacity-60"
                    >
                      {deletingId === u.id ? "Eliminando…" : "Eliminar"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && (
        <p className="text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
          {error}
        </p>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="self-start text-sm font-medium bg-accent text-white rounded px-4 py-2"
        >
          Nuevo usuario
        </button>
      ) : (
        <form
          onSubmit={createUser}
          className="bg-surface border border-border rounded p-5 flex flex-col gap-3"
        >
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Nombre
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Correo
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Contraseña
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="mínimo 6 caracteres"
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-mono uppercase tracking-wide text-muted mb-1">
              Rol
            </span>
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "OWNER" | "DIRECTOR" | "EDITOR" | "PENDING")
              }
              className="w-full border border-border rounded px-3 py-2 text-sm bg-transparent outline-none focus:border-accent"
            >
              <option value="EDITOR">Editor / Creador</option>
              <option value="DIRECTOR">Director operativo</option>
              <option value="OWNER">Administrador</option>
              <option value="PENDING">Pendiente de rol</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="text-sm font-medium bg-accent text-white rounded px-4 py-2 disabled:opacity-60"
            >
              {busy ? "Creando…" : "Crear usuario"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-muted hover:text-foreground transition"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
