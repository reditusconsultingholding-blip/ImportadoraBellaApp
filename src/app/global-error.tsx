"use client";

// Último recurso: falló el layout raíz, así que no hay estilos ni fuentes de la
// app. Por eso va con estilos en línea y lo mínimo indispensable.
export default function ErrorGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 16 }}>
          <h1 style={{ fontSize: 18 }}>Jarvis no se pudo cargar</h1>
          <p style={{ color: "#666", fontSize: 14 }}>Prueba de nuevo en un momento.</p>
          <button onClick={reset} style={{ marginTop: 12, padding: "8px 16px", cursor: "pointer" }}>
            Reintentar
          </button>
          {error.digest && <p style={{ marginTop: 16, fontSize: 12, color: "#888" }}>Código: {error.digest}</p>}
        </div>
      </body>
    </html>
  );
}
