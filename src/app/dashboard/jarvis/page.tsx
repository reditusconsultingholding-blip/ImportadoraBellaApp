import JarvisChat from "./jarvis-chat";

export default function JarvisPage() {
  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-160px)]">
      <div>
        <h1 className="text-xl font-semibold">Jarvis</h1>
        <p className="text-sm text-muted">
          Preguntale por el rendimiento de tus campañas. Cualquier acción que proponga queda
          esperando tu aprobación — nunca se ejecuta sola.
        </p>
      </div>
      <JarvisChat />
    </div>
  );
}
