"use client"

export default function CheckoutError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
      <h2 className="text-xl font-semibold mb-2">Error en el checkout</h2>
      <p className="text-gray-600 mb-4">
        Ha ocurrido un error procesando tu pedido. Por favor, inténtalo de nuevo.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition"
      >
        Reintentar
      </button>
    </div>
  )
}
