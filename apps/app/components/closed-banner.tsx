"use client";

import { Clock } from "lucide-react";
import { useAppOrderingStatus } from "@/lib/app-ordering-status";

/**
 * Banner que avisa cuando los pedidos por la app están cerrados (pausa manual
 * o fuera de horario). No renderiza nada cuando está abierto.
 */
export function ClosedBanner({ className = "" }: { className?: string }) {
  const { evaluation, loading } = useAppOrderingStatus();
  if (loading || evaluation.open) return null;

  const title = evaluation.reason === "paused" ? "Estamos en una pausa" : "Fuera de horario";

  return (
    <div
      role="status"
      className={`rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm">
          <p className="font-semibold text-amber-900">{title}</p>
          <p className="text-amber-800">{evaluation.message}</p>
        </div>
      </div>
    </div>
  );
}
