"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { CheckCircle } from "lucide-react";

export default function ConfirmedPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" /></div>}>
      <ConfirmedContent />
    </Suspense>
  );
}

function ConfirmedContent() {
  const [show, setShow] = useState(false);
  const { t } = useLanguage();
  const searchParams = useSearchParams();

  const points = searchParams.get("points") ? parseInt(searchParams.get("points")!) : 0;
  const total = searchParams.get("total") || "0.00";
  const pickupType = searchParams.get("pickup") || "ASAP";
  const orderId = searchParams.get("orderId") || "";

  useEffect(() => {
    const tm = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(tm);
  }, []);

  const pickupLabel = pickupType === "ASAP"
    ? t("checkout.asap") || "Lo antes posible (10–15 min)"
    : t("checkout.scheduled") || "Hora elegida";

  return (
    <div className="flex flex-col items-center py-16 gap-6">
      {/* Success Checkmark */}
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full transition-all duration-700 ${
          show ? "bg-leaf-50 scale-100 opacity-100" : "bg-leaf-50 scale-50 opacity-0"
        } border-2 border-leaf-200`}
      >
        <CheckCircle
          className={`h-12 w-12 text-leaf-600 transition-all duration-500 delay-300 ${
            show ? "scale-100 opacity-100" : "scale-0 opacity-0"
          }`}
        />
      </div>

      {/* Title & Subtitle */}
      <div
        className={`text-center transition-all duration-500 delay-500 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <h1 className="text-2xl font-bold text-brand-900">
          {t("checkout.confirmed.title") || "¡Pedido confirmado!"}
        </h1>
        <p className="mt-2 text-sm text-brand-500 max-w-xs mx-auto">
          {t("checkout.confirmed.subtitle") || "Tu pedido está siendo preparado"}
        </p>
      </div>

      {/* Order Number */}
      {orderId && (
        <div className={`text-center transition-all duration-500 delay-600 ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
          <p className="text-xs uppercase tracking-wider text-brand-400">{t("checkout.confirmed.order_number") || "Nº de pedido"}</p>
          <p className="text-2xl font-mono font-bold text-brand-900 tracking-wider">#{orderId.slice(-6).toUpperCase()}</p>
        </div>
      )}

      {/* Order Details */}
      <div
        className={`w-full max-w-xs space-y-3 transition-all duration-500 delay-700 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-500">{t("checkout.confirmed.total") || "Total"}</p>
            <p className="text-base font-bold text-brand-900">{total} €</p>
          </div>

          {points > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-brand-500">{t("checkout.confirmed.points") || "Granos ganados"}</p>
              <p className="text-base font-bold text-leaf-600">+{points}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-sm text-brand-500">{t("checkout.confirmed.pickup") || "Recogida"}</p>
            <p className="text-base font-bold text-brand-900">{pickupLabel}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div
        className={`flex flex-col gap-2 w-full max-w-xs transition-all duration-500 delay-1000 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <Link
          href="/orders"
          className="block w-full rounded-2xl bg-leaf-600 py-4 text-center text-sm font-semibold text-white hover:bg-leaf-700 transition-colors active:scale-[0.98] shadow-lg shadow-leaf-600/20"
        >
          {t("checkout.confirmed.view_orders") || "Ver mis pedidos"}
        </Link>
        <Link
          href="/"
          className="block w-full rounded-2xl border border-brand-200 py-3.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50 transition-colors active:scale-[0.98]"
        >
          {t("checkout.confirmed.back_menu") || "Volver al menú"}
        </Link>
      </div>
    </div>
  );
}
