import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">Esta página no existe</h1>
        <p className="mt-2 text-sm text-muted">El enlace puede estar viejo o mal copiado.</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-strong"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
