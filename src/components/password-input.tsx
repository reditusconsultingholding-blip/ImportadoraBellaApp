"use client";

import { useState } from "react";

// Campo de contraseña con el ojo para mostrarla y esconderla. Existe como
// componente y no copiado en cada pantalla porque son cinco lugares distintos
// (login, registro, primer ingreso, mi perfil, editar usuario) y así el
// comportamiento es el mismo en todos.

export default function PasswordInput({
  className = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block">
      <input
        {...props}
        type={visible ? "text" : "password"}
        // Espacio a la derecha para que el texto no pase por debajo del ojo.
        className={`${className} pr-10`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // El botón no entra en el recorrido del tabulador: quien navega con
        // teclado va del campo directo al siguiente, sin tropezarse con esto.
        tabIndex={-1}
        aria-label={visible ? "Esconder la contraseña" : "Mostrar la contraseña"}
        title={visible ? "Esconder" : "Mostrar"}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted transition hover:text-foreground"
      >
        <svg
          viewBox="0 0 20 20"
          width="17"
          height="17"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1.8 10S4.9 4.6 10 4.6 18.2 10 18.2 10 15.1 15.4 10 15.4 1.8 10 1.8 10z" />
          <circle cx="10" cy="10" r="2.6" />
          {/* La barra cruzada solo aparece cuando la contraseña está visible:
              el ojo tachado significa "haz clic para esconder". */}
          {visible && <path d="M3.5 3.5l13 13" />}
        </svg>
      </button>
    </span>
  );
}
