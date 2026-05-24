"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useCart } from "@/components/cart-provider";
import { useLanguage } from "@/components/language-provider";
import { translateProduct } from "@/lib/i18n/product-translations";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { enrichAppOrder } from "@/lib/enrich-app-order";
import { updateCustomerProfile } from "@/lib/customer-profile-service";
import { db } from "@/lib/firebase";
import Link from "next/link";
import { CreditCard, Clock, Zap, ArrowLeft } from "lucide-react";

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
    </div>
  );
}

function CheckoutContent() {
  const { user, loading: authLoading } = useAuth();
  const { items, clearCart } = useCart();
  const router = useRouter();
  const { locale, t } = useLanguage();

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickupType, setPickupType] = useState<"ASAP" | "SCHEDULED">("ASAP");
  const [pickupTime, setPickupTime] = useState("");
  const [notes, setNotes] = useState("");

  const total = items.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const amountInCents = Math.round(total * 100);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login?redirect=/checkout");
  }, [user, authLoading, router]);

  useEffect(() => {
    // Validate that cart has items before proceeding
    if (!user || items.length === 0 || amountInCents < 50) return;

    // Explicit null check before accessing user properties
    if (!user.email && !user.displayName) {
      setError(t("checkout.error.invalid_user") || "Usuario sin información válida");
      return;
    }

    let cancelled = false;

    async function go() {
      if (!user) return;
      setLoadingIntent(true);
      setError(null);

      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/create-payment-intent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: amountInCents,
            customerEmail: user.email || "",
            customerName: user.displayName || user.email || "",
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          // Distinguish between Stripe errors (402) and app/server errors
          if (res.status === 402) {
            throw new Error(`Problema con el procesador de pagos: ${data.error || "Error al procesar"}`);
          } else if (res.status >= 500) {
            throw new Error("Error del servidor. Por favor, intenta más tarde.");
          } else {
            throw new Error(data.error || "Error al crear la intención de pago");
          }
        }
        if (!cancelled) setClientSecret(data.clientSecret);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!cancelled) setLoadingIntent(false);
      }
    }

    go();
    return () => {
      cancelled = true;
    };
  }, [user, amountInCents, items.length]);

  if (authLoading) return <LoadingSpinner />;
  if (!user) return null;

  if (items.length === 0)
    return (
      <div className="flex flex-col items-center py-20 gap-4 animate-fade-up">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-100">
          <CreditCard className="h-10 w-10 text-brand-300" />
        </div>
        <p className="text-brand-500">{t("checkout.empty") || "Tu carrito está vacío"}</p>
        <Link
          href="/"
          className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm text-white hover:bg-leaf-700 transition-colors"
        >
          {t("checkout.empty.cta") || "Volver al menú"}
        </Link>
      </div>
    );

  return (
    <div className="space-y-5 animate-fade-up pb-8">
      <div className="flex items-center gap-3">
        <Link href="/cart" className="p-2 hover:bg-brand-100 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-brand-600" />
        </Link>
        <h1 className="text-xl font-bold text-brand-900">{t("checkout.title") || "Checkout"}</h1>
      </div>

      {/* Order Summary */}
      <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide sm:tracking-wider text-brand-400 mb-3">
          {t("checkout.order") || "Resumen del pedido"}
        </p>
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={`${item.product.id}-${item.modifiers?.milk || "none"}-${idx}`}
              className="flex justify-between text-sm"
            >
              <span className="text-brand-700">
                <span className="font-medium">{item.qty}×</span> {translateProduct(item.product.name, locale)}
                {item.modifiers?.milk && item.modifiers.milk !== "normal" && (
                  <span className="text-xs text-leaf-600 ml-1">· {item.modifiers.milk}</span>
                )}
              </span>
              <span className="font-medium text-brand-800 tabular-nums">
                {(item.product.price * item.qty).toFixed(2)} €
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-brand-100 pt-3 flex justify-between">
          <span className="font-semibold text-brand-900">{t("checkout.total") || "Total"}</span>
          <span className="text-lg font-bold text-leaf-700">{total.toFixed(2)} €</span>
        </div>
      </div>

      {/* Pickup Options */}
      <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3">
          {t("checkout.pickup") || "Recogida"}
        </p>
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setPickupType("ASAP")}
            className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              pickupType === "ASAP"
                ? "bg-leaf-600 text-white shadow-sm"
                : "bg-brand-100 text-brand-600 hover:bg-brand-150"
            }`}
          >
            <Zap className="h-4 w-4" />
            {t("checkout.asap") || "ASAP"}
          </button>
          <button
            onClick={() => setPickupType("SCHEDULED")}
            className={`flex-1 rounded-xl py-3 text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              pickupType === "SCHEDULED"
                ? "bg-leaf-600 text-white shadow-sm"
                : "bg-brand-100 text-brand-600 hover:bg-brand-150"
            }`}
          >
            <Clock className="h-4 w-4" />
            {t("checkout.scheduled") || "Scheduled"}
          </button>
        </div>
        {pickupType === "SCHEDULED" && (
          <input
            type="time"
            value={pickupTime}
            onChange={(e) => setPickupTime(e.target.value)}
            className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-leaf-400"
            min="08:00"
            max="20:00"
          />
        )}
        <div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 200))}
            placeholder={t("checkout.notes") || "Sin azúcar, leche de avena..."}
            rows={2}
            maxLength={200}
            className="mt-3 w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400 resize-none"
          />
          <p className="text-[11px] text-brand-400 mt-1 text-right">
            {notes.length}/200
          </p>
        </div>
      </div>

      {/* Payment */}
      <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3 flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          {t("checkout.card.title") || "Pago"}
        </p>
        {error && (
          <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {loadingIntent ? (
          <div className="flex items-center justify-center py-8 gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
            <span className="text-sm text-brand-400">
              {t("checkout.setup") || "Cargando..."}
            </span>
          </div>
        ) : clientSecret ? (
          <Elements
            key={clientSecret}
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: "stripe",
                variables: {
                  colorPrimary: "#3b723e",
                  colorBackground: "#faf7f2",
                  colorText: "#312219",
                  fontFamily: "Inter, system-ui, sans-serif",
                  borderRadius: "12px",
                },
                rules: {
                  ".Input": {
                    border: "1.5px solid #e6d9c3",
                    boxShadow: "none",
                    padding: "12px",
                  },
                  ".Input:focus": {
                    border: "1.5px solid #3b723e",
                    boxShadow: "0 0 0 2px rgba(59,114,62,0.15)",
                  },
                },
              },
              locale: locale === "es" ? "es" : "en",
            }}
          >
            <PaymentForm
              total={total}
              user={user}
              items={items}
              pickupType={pickupType}
              pickupTime={pickupTime}
              notes={notes}
              clearCart={clearCart}
            />
          </Elements>
        ) : (
          <p className="py-4 text-center text-sm text-brand-400">
            {t("checkout.error.start") || "Error al cargar pago"}
          </p>
        )}
      </div>

      <p className="text-center text-[11px] text-brand-300">
        {t("checkout.secure") || "Transacción segura con Stripe"}
      </p>
    </div>
  );
}

interface PaymentFormUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

interface CartItem {
  product: {
    id: string;
    name: string;
    price: number;
  };
  qty: number;
  modifiers?: {
    milk?: string;
  };
}

function PaymentForm({
  total,
  user,
  items,
  pickupType,
  pickupTime,
  notes,
  clearCart,
}: {
  total: number;
  user: PaymentFormUser;
  items: CartItem[];
  pickupType: "ASAP" | "SCHEDULED";
  pickupTime: string;
  notes: string;
  clearCart: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { t } = useLanguage();

  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [elementReady, setElementReady] = useState(false);

  // Keep a current reference to items to avoid stale closure
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const handleSubmit = async () => {
    if (!stripe || !elements || !elementReady) {
      setPayError(t("checkout.error.notready") || "Formulario no listo");
      return;
    }

    if (pickupType === "SCHEDULED" && !pickupTime) {
      setPayError(t("checkout.error.time") || "Selecciona una hora");
      return;
    }

    // Validate that scheduled time is not in the past
    if (pickupType === "SCHEDULED" && pickupTime) {
      const now = new Date();
      const [hours, minutes] = pickupTime.split(":").map(Number);
      const selectedDateTime = new Date();
      selectedDateTime.setHours(hours, minutes, 0);

      if (selectedDateTime < now) {
        setPayError(t("checkout.error.pasttime") || "La hora no puede ser en el pasado");
        return;
      }
    }

    setProcessing(true);
    setPayError(null);

    try {
      const { error: se } = await elements.submit();
      if (se) {
        setPayError(se.message || t("checkout.error.payment") || "Error en el pago");
        setProcessing(false);
        return;
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/checkout/success",
          receipt_email: user.email || undefined,
        },
        redirect: "if_required",
      });

      if (error) {
        // Distinguish between different error types
        let userMessage = error.message || "Error desconocido en el pago";
        if (error.code === "card_declined") {
          userMessage = t("checkout.error.declined") || "Tu tarjeta ha sido rechazada. Intenta otra.";
        } else if (error.code === "card_error") {
          userMessage = t("checkout.error.card") || "Error en la tarjeta: " + error.message;
        } else if (error.code === "authentication_error") {
          userMessage = t("checkout.error.auth") || "Error de autenticación. Por favor, intenta de nuevo.";
        } else if (error.code === "api_connection_error") {
          userMessage = t("checkout.error.network") || "Error de conexión. Verifica tu internet e intenta de nuevo.";
        } else if (error.code === "api_error") {
          userMessage = t("checkout.error.server") || "Error del servidor. Por favor, intenta más tarde.";
        }
        setPayError(userMessage);
        setProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        // SECURITY: Create order with paymentIntentId reference to maintain consistency
        // The payment intent is already created and confirmed, so we link it to the order
        const enrichData = await enrichAppOrder(itemsRef.current, user.uid);
        await addDoc(collection(db, "orders"), {
          ...enrichData,
          source: "APP",
          customerUid: user.uid,
          customerName: user.displayName || user.email || "Customer",
          customerEmail: user.email || "",
          items: itemsRef.current.map((i: CartItem) => ({
            productId: i.product.id,
            productName: i.product.name,
            unitPrice: i.product.price,
            qty: i.qty,
            ...(i.modifiers ? { modifiers: i.modifiers } : {}),
          })),
          total,
          pickupType,
          pickupTimeLabel:
            pickupType === "SCHEDULED" && pickupTime ? pickupTime : null,
          notes: notes.trim() || null,
          status: "CREATED",
          paymentMethod: "CARD",
          paymentStatus: "PAID",
          paymentIntentId: paymentIntent.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        // Load all dependencies in parallel instead of sequential waterfall
        const [
          { awardPoints, calculatePoints },
          { recordPurchaseForGamification },
        ] = await Promise.all([
          import("@/lib/loyalty-points-service"),
          import("@/lib/gamification/firebase-service"),
        ]);

        // Award loyalty points
        awardPoints(
          user.uid,
          calculatePoints(total),
          "APP",
          paymentIntent.id,
          `Compra APP ${total.toFixed(2)}€`,
          total,
          itemsRef.current.map((i: CartItem) => i.product.name)
        ).catch(console.error);

        // Update profile and gamification in parallel
        await Promise.all([
          updateCustomerProfile({
            customerUid: user.uid,
            customerName: user.displayName || user.email || "Customer",
            customerEmail: user.email || "",
            total,
            items: itemsRef.current.map((i: CartItem) => ({
              productName: i.product.name,
              qty: i.qty,
            })),
            paymentMethod: "CARD",
            source: "APP",
          }),
          recordPurchaseForGamification(user.uid, {
            productNames: itemsRef.current.map((i: CartItem) => i.product.name),
            source: "APP",
            euroAmount: total,
          }),
        ]).catch(console.warn);

        clearCart();
        router.push("/checkout/success");
      }
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : "Error desconocido");
      setProcessing(false);
    }
  };

  return (
    <div>
      <PaymentElement onReady={() => setElementReady(true)} options={{ layout: "tabs" }} />
      {payError && (
        <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
          {payError}
        </div>
      )}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!stripe || !elementReady || processing}
        className={`mt-4 w-full rounded-2xl py-4 text-base font-semibold text-white shadow-lg transition-all ${
          processing || !elementReady
            ? "bg-brand-300 cursor-not-allowed"
            : "bg-leaf-600 hover:bg-leaf-700 active:scale-[0.98] shadow-leaf-600/20"
        }`}
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {t("checkout.processing") || "Procesando..."}
          </span>
        ) : !elementReady ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {t("checkout.loading") || "Cargando..."}
          </span>
        ) : (
          `${t("checkout.pay") || "Pagar"} ${total.toFixed(2)} €`
        )}
      </button>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <CheckoutContent />
    </Suspense>
  );
}
