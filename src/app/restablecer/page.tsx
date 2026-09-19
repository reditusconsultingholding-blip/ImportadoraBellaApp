import { Suspense } from "react";
import FormularioRestablecer from "./formulario";

// A donde lleva el enlace del correo de recuperación. Es pública (quien llega
// no tiene sesión); lo que la protege es el enlace, que vence en 30 minutos y
// sirve una sola vez. Ver src/app/api/auth/restablecer.
export default function RestablecerPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-brand-navy px-4 py-10">
      <Suspense>
        <FormularioRestablecer />
      </Suspense>
    </main>
  );
}
