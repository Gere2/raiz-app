"use client";

import { useCart } from "@/components/cart-provider";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { translateProduct } from "@/lib/i18n/product-translations";
import { MilkIcon } from "@/lib/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShoppingBag, ArrowRight, Minus, Plus } from "lucide-react";
import type { MilkOption } from "@/types";

const MILK_LABELS: Record<MilkOption, { es: string; en: string }> = {
  "normal": { es: "Leche normal", en: "Regular milk" },
  "sin-lactosa": { es: "Sin lactosa", en: "Lactose-free" },
  "almendras": { es: "Leche almendras", en: "Almond milk" },
  "avena": { es: "Leche avena", en: "Oat milk" },
};

export default function CartPage() {
  const { items, updateQty, clearCart, getItemKey } = useCart();
  const { user } = useAuth();
  const { locale, t } = useLanguage();
  const router = useRouter();
  const isEn = locale === "en";
  const total = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);

  if (items.length === 0)
    return (
      <div className="flex flex-col items-center py-20 gap-4 animate-fade-up">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100">
          <ShoppingBag className="h-10 w-10 text-brand-300" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-brand-800">{t("cart.empty.title")}</p>
          <p className="mt-1 text-sm text-brand-400">{t("cart.empty.subtitle")}</p>
        </div>
        <Link
          href="/"
          className="mt-2 rounded-full bg-leaf-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-leaf-700"
        >
          {t("cart.empty.cta")}
        </Link>
      </div>
    );

  const handleClearCart = () => {
    if (window.confirm(isEn ? "Clear all items from cart?" : "¿Vaciar todos los productos del carrito?")) {
      clearCart();
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-brand-900">{t("cart.title")}</h1>
        <button
          onClick={handleClearCart}
          className="text-xs text-brand-400 hover:text-red-500 transition-colors"
        >
          {t("cart.clear")}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const name = translateProduct(item.product.name, locale);
          const key = getItemKey(item);
          const milkLabel = item.modifiers?.milk
            ? MILK_LABELS[item.modifiers.milk]?.[isEn ? "en" : "es"]
            : null;

          return (
            <div
              key={key}
              className="flex items-center gap-3 rounded-2xl border border-brand-200/70 bg-white p-3.5"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-brand-900 leading-snug">{name}</p>
                {milkLabel && (
                  <p className="text-[11px] text-leaf-600 mt-0.5 flex items-center gap-1">
                    <MilkIcon milk={item.modifiers?.milk ?? "normal"} className="h-3.5 w-3.5 text-leaf-600" />
                    {milkLabel}
                  </p>
                )}
                <p className="text-xs text-brand-400 mt-0.5">
                  {item.product.price.toFixed(2)} € {t("cart.unit")}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => updateQty(key, item.qty - 1)}
                  aria-label={isEn ? `Decrease quantity for ${name}` : `Disminuir cantidad para ${name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 text-brand-600 transition-colors hover:bg-brand-100 active:scale-95"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-bold text-brand-900 tabular-nums">
                  {item.qty}
                </span>
                <button
                  onClick={() => updateQty(key, item.qty + 1)}
                  aria-label={isEn ? `Increase quantity for ${name}` : `Aumentar cantidad para ${name}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 text-brand-600 transition-colors hover:bg-brand-100 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <span className="w-16 text-right text-sm font-bold text-brand-800 tabular-nums shrink-0">
                {(item.product.price * item.qty).toFixed(2)} €
              </span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl bg-brand-900 p-6 text-brand-50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-brand-300 uppercase tracking-wide">{t("cart.total")}</p>
            <p className="text-lg sm:text-2xl font-bold mt-1">{total.toFixed(2)} €</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-brand-300">
              {items.length} {items.length === 1 ? t("cart.product") : t("cart.products")}
            </p>
            <p className="text-xs text-brand-300">
              {items.reduce((s, i) => s + i.qty, 0)} {t("cart.units")}
            </p>
          </div>
        </div>
      </div>

      <button
        onClick={() =>
          user
            ? router.push("/checkout")
            : router.push("/login?redirect=/checkout")
        }
        className="w-full rounded-2xl bg-leaf-600 py-4 px-4 text-base font-semibold text-white transition-all hover:bg-leaf-700 active:scale-[0.98] shadow-lg shadow-leaf-600/20 flex items-center justify-center gap-2"
      >
        {user ? t("cart.continue") : t("cart.signin")}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
