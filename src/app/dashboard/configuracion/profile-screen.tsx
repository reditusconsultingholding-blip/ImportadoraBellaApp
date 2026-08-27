"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PasswordInput from "@/components/password-input";
import { useRouter } from "next/navigation";

type Msg = { type: "ok" | "error"; text: string } | null;

const inputClass =
  "w-full border border-border rounded px-3 py-2 text-sm bg-surface-2 outline-none focus:border-accent focus:bg-surface";
const labelClass = "block text-xs font-medium text-muted mb-1";
const primaryBtn =
  "text-sm font-medium bg-accent text-white rounded px-4 py-2 hover:bg-accent-strong transition disabled:opacity-60";

// La foto se reduce en el navegador antes de subirla: entra una imagen de
// cualquier tamaño y sale un cuadrado de 256px. Así no viaja un archivo de
// varios MB ni queda guardado en la base.
const AVATAR_PX = 256;

async function shrinkToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen.");
  // Recorte centrado: la foto queda cuadrada sin deformarse.
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_PX,
    AVATAR_PX
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={`text-xs mt-2 ${msg.type === "ok" ? "text-good" : "text-critical"}`}>{msg.text}</p>
  );
}

export default function ProfileScreen({
  role,
  position,
  email,
  profile,
  creationCode,
}: {
  role: string;
  position: string | null;
  email: string;
  profile: { name: string; phone: string; birthDate: string; avatarUrl: string | null };
  creationCode: { code: string; expiresAt: string } | null;
}) {
  const router = useRouter();

  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [birthDate, setBirthDate] = useState(profile.birthDate);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [dataMsg, setDataMsg] = useState<Msg>(null);
  const [dataBusy, setDataBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [newEmail, setNewEmail] = useState(email);
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passMsg, setPassMsg] = useState<Msg>(null);
  const [passBusy, setPassBusy] = useState(false);

  async function patchProfile(payload: Record<string, unknown>) {
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "No se pudo guardar.");
    return data;
  }

  async function saveData(e: React.FormEvent) {
    e.preventDefault();
    setDataBusy(true);
    setDataMsg(null);
    try {
      await patchProfile({ name, phone, birthDate: birthDate || null });
      setDataMsg({ type: "ok", text: "Datos guardados." });
      router.refresh();
    } catch (err) {
      setDataMsg({ type: "error", text: err instanceof Error ? err.message : "No se pudo guardar." });
    }
    setDataBusy(false);
  }

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDataMsg(null);
    try {
      const dataUrl = await shrinkToDataUrl(file);
      await patchProfile({ avatarUrl: dataUrl });
      setAvatarUrl(dataUrl);
      setDataMsg({ type: "ok", text: "Foto actualizada." });
      router.refresh();
    } catch (err) {
      setDataMsg({
        type: "error",
        text: err instanceof Error ? err.message : "No se pudo subir la foto.",
      });
    }
  }

  async function removePhoto() {
    setDataMsg(null);
    try {
      await patchProfile({ avatarUrl: null });
      setAvatarUrl(null);
      router.refresh();
    } catch (err) {
      setDataMsg({ type: "error", text: err instanceof Error ? err.message : "No se pudo quitar." });
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailBusy(true);
    setEmailMsg(null);
    const res = await fetch("/api/auth/change-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail, currentPassword: emailPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setEmailBusy(false);
    if (!res.ok) {
      setEmailMsg({ type: "error", text: data.error ?? "No se pudo cambiar el correo." });
      return;
    }
    setEmailPassword("");
    setEmailMsg({ type: "ok", text: `Listo — ahora entrás con ${data.email}.` });
    router.refresh();
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassBusy(true);
    setPassMsg(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
    const data = await res.json().catch(() => ({}));
    setPassBusy(false);
    if (!res.ok) {
      setPassMsg({ type: "error", text: data.error ?? "No se pudo cambiar la contraseña." });
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPassMsg({ type: "ok", text: "Contraseña actualizada." });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold">Mi perfil</h1>
        <p className="text-sm text-muted mt-1">
          {role}
          {position ? ` · ${position}` : ""}
        </p>
      </div>

      {creationCode && <CreationCode {...creationCode} />}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {/* Datos */}
        <form onSubmit={saveData} className="bg-surface border border-border rounded p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-sm">Datos</h2>

          <div className="flex items-center gap-4">
            <button
            type="button"
              onClick={() => fileRef.current?.click()}
              title="Cambiar la foto"
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-border bg-surface-2"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Tu foto" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full w-full place-items-center text-base font-semibold text-muted">
                  {initials(name || "?")}
                </span>
              )}
            </button>
            <div className="text-xs text-muted">
              <button
            type="button"
                onClick={() => fileRef.current?.click()}
            className="text-accent hover:underline"
              >
                Hacé clic en la foto para cambiarla
              </button>
              {avatarUrl && (
                <>
                  {" · "}
                  <button type="button" onClick={removePhoto} className="text-critical hover:underline">
                    quitar
                  </button>
                </>
              )}
              <span className="block mt-1">Se recorta cuadrada y se achica sola.</span>
            </div>
            <input
              ref={fileRef}
            type="file"
              accept="image/png,image/jpeg,image/webp"
            onChange={pickPhoto}
            className="hidden"
            />
          </div>

          <label className="block">
            <span className={labelClass}>Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Fecha de nacimiento</span>
            <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Teléfono</span>
            <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+593 99 123 4567"
            className={inputClass}
            />
          </label>

          <div>
            <button type="submit" disabled={dataBusy} className={primaryBtn}>
              {dataBusy ? "Guardando…" : "Guardar cambios"}
            </button>
            <Message msg={dataMsg} />
          </div>
        </form>

        <div className="flex flex-col gap-4">
          {/* Correo */}
          <form onSubmit={saveEmail} className="bg-surface border border-border rounded p-5 flex flex-col gap-3">
            <h2 className="font-semibold text-sm">Correo</h2>
            <p className="text-xs text-muted -mt-1">Actual: {email}</p>
            <label className="block">
              <span className={labelClass}>Correo nuevo</span>
              <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Confirmá tu contraseña actual</span>
              <PasswordInput
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={inputClass}
              />
            </label>
            <div>
              <button type="submit" disabled={emailBusy} className={primaryBtn}>
                {emailBusy ? "Guardando…" : "Cambiar correo"}
              </button>
              <Message msg={emailMsg} />
            </div>
          </form>

          {/* Contraseña */}
          <form onSubmit={savePassword} className="bg-surface border border-border rounded p-5 flex flex-col gap-3">
            <h2 className="font-semibold text-sm">Cambiar contraseña</h2>
            <label className="block">
              <span className={labelClass}>Contraseña actual</span>
              <PasswordInput
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Contraseña nueva</span>
              <PasswordInput
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="mínimo 8 caracteres"
            className={inputClass}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Confirmar contraseña nueva</span>
              <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className={inputClass}
              />
            </label>
            <div>
              <button type="submit" disabled={passBusy} className={primaryBtn}>
                {passBusy ? "Guardando…" : "Cambiar contraseña"}
              </button>
              <Message msg={passMsg} />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function CreationCode({ code, expiresAt }: { code: string; expiresAt: string }) {
  const router = useRouter();

  // El vencimiento llega del servidor como instante absoluto; acá solo se
  // convierte a número, que es una operación pura. El reloj se lee dentro del
  // intervalo, nunca durante el renderizado.
  const expiresMs = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const left = Math.max(0, Math.ceil((expiresMs - now) / 1000));

  useEffect(() => {
    // Venció: se pide el siguiente al servidor, que es quien lo sabe calcular.
    // El secreto nunca baja al navegador.
    if (left === 0) router.refresh();
  }, [left, router]);

  return (
    <div className="bg-surface border border-border rounded p-5">
      <h2 className="font-semibold text-sm">Código para crear usuarios</h2>
      <p className="text-xs text-muted mt-1 max-w-xl">
        Solo vos ves este código y cambia cada 30 segundos. Hace falta para dar de alta a alguien en
        Usuarios, y también para que alguien se registre desde el login — si te lo piden, dictáselo
        en el momento.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="font-mono text-2xl font-semibold tracking-[0.28em] tabular-nums border border-border rounded bg-surface-2 px-4 py-2">
          {code}
        </span>
        <span className="text-xs text-muted tabular-nums">cambia en {left}s</span>
      </div>
    </div>
  );
}
