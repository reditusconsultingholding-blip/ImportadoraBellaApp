"use client";

import { useState } from "react";
import PasswordInput from "@/components/password-input";
import { useRouter } from "next/navigation";

// La pantalla de entrada. Solo entrada.
//
// Antes tenía también "Crear cuenta": cualquiera con el código de seis dígitos
// se hacía una cuenta y quedaba sin rol hasta que un administrador se lo diera.
// Se sacó por pedido del dueño, y porque el flujo real es el otro: las cuentas
// las crea la dirección desde Usuarios, con su rol ya puesto, y la persona
// entra con una clave provisoria que está obligada a cambiar.
//
// Que el registro abierto dejara la cuenta sin permisos lo hacía poco
// peligroso, pero no inofensivo: sumaba gente desconocida a la lista de
// usuarios de un panel financiero, y el código circulaba por WhatsApp.

const inputClass =
  "w-full border border-border rounded px-3 py-2 bg-surface-2 outline-none focus:border-accent focus:bg-surface";
const labelClass = "block text-xs font-medium text-muted mb-1";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "No se pudo iniciar sesión.");
      return;
    }

    // Con una clave provisoria no se llega al panel: se va derecho a elegir una
    // propia. Es lo que hace que la clave repartida por escrito deje de servir
    // apenas la persona entra.
    router.push(data.mustChangePassword ? "/cambiar-clave" : "/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-navy px-4 py-10">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded p-8"
      >
        <div className="mb-6">
          {/* El nombre entero en una línea. Partido en "Importadora" chiquito y
              "Bella" grande se leía como si la empresa se llamara Bella. */}
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-foreground">
            Importadora Bella
          </h1>
          <p className="mt-1 text-[11px] leading-none text-muted">by Reditus Developers</p>
          <p className="mt-2 text-sm text-muted">
            Panel de campañas, ventas y contenido creativo.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-critical bg-critical-bg border border-critical/30 rounded px-3 py-2">
            {error}
          </div>
        )}

        <label className="block mb-4">
          <span className={labelClass}>Correo</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="nombre@bellacorp.store"
          />
        </label>

        <label className="block mb-5">
          <span className={labelClass}>Contraseña</span>
          <PasswordInput
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent text-white rounded py-2.5 font-medium hover:bg-accent-strong transition disabled:opacity-60"
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>

        {/* Dónde se consigue una cuenta, ahora que no se puede crear sola. Sin
            esta línea, quien no tenga acceso se queda mirando un formulario que
            no le sirve, sin saber a quién pedirle. */}
        <p className="mt-5 text-xs leading-relaxed text-muted">
          Las cuentas las crea la dirección. Si todavía no tenés una, pedíla a Fabricio o a
          Katherine: te van a dar una clave provisoria que vas a cambiar apenas entres.
        </p>
      </form>
    </main>
  );
}
