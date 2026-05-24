import Link from "next/link"

/**
 * Página 404 personalizada — estilo Raíz y Grano.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 text-center animate-fade-up">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-100">
        <span className="text-5xl">🌿</span>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-300 mb-2">404</p>
        <h1 className="text-2xl font-bold text-brand-900">Página no encontrada</h1>
        <p className="mt-2 text-sm text-brand-500 max-w-xs mx-auto">
          Esta página no existe o ha sido movida. Vuelve a la carta para seguir explorando.
        </p>
      </div>

      <Link
        href="/"
        className="rounded-2xl bg-leaf-600 px-8 py-3.5 text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98] transition-all shadow-lg shadow-leaf-600/20"
      >
        Ver la carta
      </Link>
    </div>
  )
}
