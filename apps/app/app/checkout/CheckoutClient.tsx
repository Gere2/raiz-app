"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Clock, Zap } from "lucide-react";

import { useCart } from "@/components/cart-provider";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { createOrder } from "@/lib/services/order-service";
import { calculatePoints, awardPoints } from "@/lib/loyalty-points-service";

// Sanitize user input to prevent XSS: strip HTML tags
function sanitizeNotes(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

export default function CheckoutClient() {
  const { items, clearCart } = useCart();
  const { user } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [pickupType, setPickupType] = useState<"ASAP" | "SCHEDULED">("ASAP");
  const [pickupTime, setPickupTime] = useState("");

  const handlePlaceOrder = async () => {
    if (!user) {
      router.push(`/login?redirect=/checkout`);
      return;
    }

    // Additional null check before using user properties
    if (!user.uid) {
      toast.error(t("checkout.error.signin") || "Error de autenticación");
      return;
    }

    if (items.length === 0) {
      toast.error(t("checkout.error.empty") || "Tu carrito está vacío");
      return;
    }

    if (pickupType === "SCHEDULED" && !pickupTime) {
      toast.error(t("checkout.error.time") || "Elige una hora de recogida");
      return;
    }

    // Validate business hours (08:00 - 20:00)
    if (pickupType === "SCHEDULED" && pickupTime) {
      const [hours, minutes] = pickupTime.split(":").map(Number);
      if (hours < 8 || hours >= 20) {
        toast.error(t("checkout.error.hours") || "La recogida debe ser entre 8:00 y 20:00");
        return;
      }

      // Validate time is not in the past
      const now = new Date();
      const selectedDateTime = new Date();
      selectedDateTime.setHours(hours, minutes, 0);
      if (selectedDateTime < now) {
        toast.error(t("checkout.error.pasttime") || "Selecciona una hora futura");
        return;
      }
    }

    try {
      setSubmitting(true);

      const total = items.reduce((sum, it) => sum + it.product.price * it.qty, 0);

      // Creamos el pedido APP en Firestore (aún sin pago real)
      // SECURITY: Sanitize notes to prevent XSS in dashboard
      const sanitizedNotes = sanitizeNotes(notes);
      const docRef = await createOrder({
        userId: user.uid,
        customerName: user.displayName || user.email || "Cliente",
        customerEmail: user.email || "",
        items,
        total,
        pickupType,
        pickupTime: pickupType === "SCHEDULED" ? pickupTime : undefined,
        notes: sanitizedNotes,
        paymentStatus: "PENDING",
        paymentMethod: "CASH",
      });

      // Use Promise.allSettled to handle async operations safely
      const points = calculatePoints(total);
      const promises: Promise<unknown>[] = [];

      // Award loyalty points (pass euroAmount + productNames so server-loyalty path is used)
      if (points > 0) {
        promises.push(
          awardPoints(
            user.uid,
            points,
            "APP",
            `app-${Date.now()}`,
            `Pedido App · ${total.toFixed(2)}€`,
            total,
            items.map((i) => i.product.name),
          ).catch((err) => {
            console.error("[Loyalty] Error awarding:", err);
            // Don't throw - let other operations continue
            return { error: err };
          })
        );
      }

      // Gamificación: streak, badges, misiones, productos únicos
      // Wrap import in try-catch to isolate failures before Promise.allSettled
      promises.push(
        (async () => {
          try {
            const { recordPurchaseForGamification } = await import("@/lib/gamification/firebase-service");
            return recordPurchaseForGamification(user.uid, {
              productNames: items.map((i) => i.product.name),
              source: "APP",
            }).catch((err) => {
              console.warn("[Gamification] Side-effect error:", err);
              // Don't throw - let cart clearing continue
              return { error: err };
            });
          } catch (importErr) {
            console.warn("[Gamification] Import failed:", importErr);
            return { error: importErr };
          }
        })()
      );

      // Wait for all side effects to settle before clearing cart
      await Promise.allSettled(promises);

      // Clear cart only after async operations complete
      clearCart();
      toast.success(
        points > 0
          ? `${t("checkout.success.created") || "Pedido creado"} · +${points} ${t("checkout.success.grains") || "granos"}`
          : t("checkout.success.created") || "Pedido creado"
      );
      router.push(`/checkout/confirmed?points=${points}&total=${total.toFixed(2)}&pickup=${pickupType}&orderId=${docRef.id || ""}`);
    } catch {
      toast.error(t("checkout.error.create") || "No se pudo crear el pedido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-brand-900">{t("checkout.title") || "Checkout"}</h1>

      {!user && (
        <div className="rounded-2xl border border-brand-200/70 bg-white p-4 text-sm">
          <p className="text-brand-600">
            {t("checkout.error.signin") || "Necesitas iniciar sesión para confirmar el pedido."}
          </p>
          <button
            onClick={() => router.push(`/login?redirect=/checkout`)}
            className="mt-3 w-full rounded-2xl bg-leaf-600 py-2.5 text-sm font-medium text-white hover:bg-leaf-700 transition-colors"
          >
            {t("checkout.goto_login") || "Ir a login"}
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-brand-200/70 bg-white p-4 text-sm">
        <p className="text-brand-600">
          <span className="text-brand-400">{t("checkout.order_for") || "Pedido para:"}</span>{" "}
          <span className="font-medium text-brand-900">
            {user?.displayName || user?.email || "—"}
          </span>
        </p>
      </div>

      <div className="rounded-2xl border border-brand-200/70 bg-white p-4 space-y-4">
        <p className="text-sm font-semibold text-brand-900">
          {t("checkout.pickup_time") || "Hora de recogida"}
        </p>

        <div className="flex gap-2">
          <button
            onClick={() => setPickupType("ASAP")}
            className={`flex-1 rounded-xl py-3 px-4 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              pickupType === "ASAP"
                ? "bg-leaf-600 text-white shadow-lg shadow-leaf-600/20"
                : "bg-brand-50 text-brand-600 border border-brand-200/50 hover:bg-brand-100"
            }`}
          >
            <Zap className="h-4 w-4" />
            {t("checkout.asap") || "Lo antes posible (10–15 min)"}
          </button>
          <button
            onClick={() => setPickupType("SCHEDULED")}
            className={`flex-1 rounded-xl py-3 px-4 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              pickupType === "SCHEDULED"
                ? "bg-leaf-600 text-white shadow-lg shadow-leaf-600/20"
                : "bg-brand-50 text-brand-600 border border-brand-200/50 hover:bg-brand-100"
            }`}
          >
            <Clock className="h-4 w-4" />
            {t("checkout.scheduled") || "Elegir hora"}
          </button>
        </div>

        {pickupType === "SCHEDULED" && (
          <input
            type="time"
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            required
            className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-leaf-400"
            min="08:00"
            max="20:00"
          />
        )}
      </div>

      <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
        <label className="block text-sm font-semibold text-brand-900 mb-3">
          {t("checkout.notes") || "Notas (opcional)"} ({notes.length}/500)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 500))}
          placeholder={t("checkout.notes.placeholder") || "Sin azúcar, leche de avena..."}
          className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400 resize-none"
          rows={2}
          maxLength={500}
        />
      </div>

      <button
        onClick={handlePlaceOrder}
        disabled={submitting || !user}
        className="w-full rounded-2xl bg-leaf-600 py-4 px-4 text-base font-semibold text-white transition-all hover:bg-leaf-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-leaf-600/20 flex items-center justify-center gap-2"
      >
        <CreditCard className="h-5 w-5" />
        {submitting
          ? t("checkout.creating") || "Creando pedido..."
          : t("checkout.confirm") || "Confirmar pedido"}
      </button>

      <Link
        href="/cart"
        className="block text-center text-sm text-brand-500 hover:text-brand-700 underline transition-colors"
      >
        {t("checkout.back_to_cart") || "Volver al carrito"}
      </Link>
    </div>
  );
}
