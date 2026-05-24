"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { translateProduct } from "@/lib/i18n/product-translations";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe";
import { collection, getDocs, query, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  getMeetingCombos,
  createTeacherOrder,
  listenTeacherOrders,
} from "@/lib/teacher-order-service";
import type {
  MeetingCombo,
  ComboSlot,
  ComboSlotOption,
  TeacherOrderItem,
  TeacherDeliveryInfo,
  DeliveryLocation,
  TeacherOrder,
} from "@/types/teacher-order";
import type { Product } from "@/types";
import {
  ArrowLeft,
  Users,
  MapPin,
  Clock,
  User,
  Building2,
  Phone,
  FileText,
  Package,
  Coffee,
  Check,
  Minus,
  Plus,
  Sparkles,
  AlertCircle,
  CreditCard,

  ClipboardList,
  ChevronRight,
  X,
} from "lucide-react";
import Link from "next/link";

// ── Status helpers ──

const STATUS_CONFIG: Record<
  string,
  { label: string; labelEn: string; color: string; icon: string }
> = {
  // Legacy teacher statuses
  PENDING: { label: "Pendiente", labelEn: "Pending", color: "bg-amber-100 text-amber-700", icon: "⏳" },
  CONFIRMED: { label: "Confirmado", labelEn: "Confirmed", color: "bg-blue-100 text-blue-700", icon: "✅" },
  EN_CAMINO: { label: "En camino", labelEn: "On the way", color: "bg-indigo-100 text-indigo-700", icon: "🚶" },
  DELIVERED: { label: "Entregado", labelEn: "Delivered", color: "bg-green-100 text-green-700", icon: "📦" },
  CANCELLED: { label: "Cancelado", labelEn: "Cancelled", color: "bg-red-100 text-red-700", icon: "❌" },
  // POS-compatible statuses (used in unified "orders" collection)
  CREATED: { label: "Nuevo", labelEn: "New", color: "bg-violet-100 text-violet-700", icon: "🆕" },
  IN_QUEUE: { label: "En cola", labelEn: "In queue", color: "bg-blue-100 text-blue-700", icon: "📋" },
  PREPARING: { label: "Preparando", labelEn: "Preparing", color: "bg-purple-100 text-purple-700", icon: "👨‍🍳" },
  READY: { label: "Listo", labelEn: "Ready", color: "bg-emerald-100 text-emerald-700", icon: "✅" },
  PICKED_UP: { label: "Recogido", labelEn: "Picked up", color: "bg-gray-100 text-gray-500", icon: "📦" },
  CANCELED: { label: "Cancelado", labelEn: "Canceled", color: "bg-red-100 text-red-700", icon: "❌" },
};

// ── Location options ──

const LOCATION_OPTIONS: { value: DeliveryLocation; label: string; labelEn: string; icon: typeof MapPin }[] = [
  { value: "classroom", label: "Aula / Clase", labelEn: "Classroom", icon: ClipboardList },
  { value: "office", label: "Oficina / Despacho", labelEn: "Office", icon: Building2 },
  { value: "sala_reuniones", label: "Sala de reuniones", labelEn: "Meeting room", icon: Users },
  { value: "other", label: "Otro lugar", labelEn: "Other location", icon: MapPin },
];

type TabType = "combos" | "custom" | "orders";

/** Map slot category type to keywords that match Firebase category names */
const SLOT_CATEGORY_KEYWORDS: Record<string, string[]> = {
  beverage: ["café", "cafe", "cafes", "cafés", "bebida", "bebidas", "drink", "drinks", "tea", "té", "zumo", "juice", "chocolate"],
  food: ["bollería", "bolleria", "comida", "food", "tostada", "toast", "croissant", "desayuno", "breakfast", "sandwich"],
  snack: ["snack", "snacks", "galleta", "cookie", "dulce", "sweet", "muffin", "brownie", "postre", "dessert"],
};

// ── Slot selection state per combo being configured ──
interface ComboConfig {
  comboId: string;
  /** For each slot index → array of chosen product IDs (length = slot.quantity) */
  slotSelections: string[][];
}

// ── Stripe Payment Form (must be inside <Elements>) ──
function TeacherPaymentForm({
  total,
  isEn,
  submitting,
  validateDelivery,
  onPaymentSuccess,
  userEmail,
}: {
  total: number;
  isEn: boolean;
  submitting: boolean;
  validateDelivery: () => boolean;
  onPaymentSuccess: (paymentIntentId: string) => Promise<void>;
  userEmail: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [elementReady, setElementReady] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements || !elementReady) {
      setPayError(isEn ? "Payment form not ready" : "Formulario de pago no listo");
      return;
    }

    // Validate delivery fields first
    if (!validateDelivery()) return;

    setProcessing(true);
    setPayError(null);

    try {
      // Submit the payment element
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setPayError(submitError.message || (isEn ? "Payment error" : "Error en el pago"));
        setProcessing(false);
        return;
      }

      // Confirm the payment
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + "/teacher-orders",
          receipt_email: userEmail || undefined,
        },
        redirect: "if_required",
      });

      if (error) {
        let userMessage = error.message || (isEn ? "Unknown payment error" : "Error desconocido en el pago");
        if (error.code === "card_declined") {
          userMessage = isEn ? "Your card was declined. Try another." : "Tu tarjeta ha sido rechazada. Intenta otra.";
        } else if (error.code === "authentication_error") {
          userMessage = isEn ? "Authentication error. Please try again." : "Error de autenticación. Intenta de nuevo.";
        }
        setPayError(userMessage);
        setProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        await onPaymentSuccess(paymentIntent.id);
      }
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : (isEn ? "Unknown error" : "Error desconocido"));
    } finally {
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
        onClick={handlePay}
        disabled={!stripe || !elementReady || processing || submitting}
        className={`mt-4 w-full rounded-2xl py-4 text-base font-semibold text-white shadow-lg transition-all ${
          processing || !elementReady || submitting
            ? "bg-brand-300 cursor-not-allowed"
            : "bg-leaf-600 hover:bg-leaf-700 active:scale-[0.98] shadow-leaf-600/20"
        }`}
      >
        {processing || submitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {processing
              ? (isEn ? "Processing payment..." : "Procesando pago...")
              : (isEn ? "Placing order..." : "Enviando pedido...")}
          </span>
        ) : !elementReady ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            {isEn ? "Loading..." : "Cargando..."}
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <CreditCard className="h-4 w-4" />
            {isEn ? `Pay & place order · ${total.toFixed(2)} €` : `Pagar y enviar · ${total.toFixed(2)} €`}
          </span>
        )}
      </button>
    </div>
  );
}

export default function TeacherOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { locale } = useLanguage();
  const isEn = locale === "en";

  // Auth & role state
  const [isTeacherUser, setIsTeacherUser] = useState<boolean | null>(null);
  const [, setTeacherName] = useState("");

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>("combos");

  // Combos state
  const [combos, setCombos] = useState<MeetingCombo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [loadingData, setLoadingData] = useState(true);

  // Combo configurator
  const [activeComboConfig, setActiveComboConfig] = useState<ComboConfig | null>(null);

  // Cart state (for both combos and custom)
  const [selectedItems, setSelectedItems] = useState<TeacherOrderItem[]>([]);

  // Custom builder
  const [customAttendees, setCustomAttendees] = useState(5);

  // Delivery form
  const [showDeliveryForm, setShowDeliveryForm] = useState(false);
  const [delivery, setDelivery] = useState<TeacherDeliveryInfo>({
    location: "classroom",
    locationDetail: "",
    deliveryTime: "",
    deliveryDate: new Date().toISOString().split("T")[0],
    recipientName: "",
    department: "",
    attendees: 0,
    contactPhone: "",
    notes: "",
  });
  const paymentMethod = "tarjeta" as const; // Always card payment now
  const [submitting, setSubmitting] = useState(false);

  // Stripe payment state
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  // ── Calculate total (must be before PaymentIntent effect) ──
  const total = selectedItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

  // Orders state
  const [orders, setOrders] = useState<TeacherOrder[]>([]);

  // ── Auth check ──
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace("/login?redirect=/teacher-orders");
      return;
    }
    // Check teacher status and onboarding
    const checkTeacherAndOnboarding = async () => {
      const snap = await import("firebase/firestore").then(({ getDoc, doc: fbDoc }) =>
        getDoc(fbDoc(db, "customer_profiles", user.uid))
      );
      if (!snap.exists()) { setIsTeacherUser(false); return; }
      const data = snap.data();
      const isTeacherResult = data.userType === "teacher";
      setIsTeacherUser(isTeacherResult);
      if (isTeacherResult) {
        setTeacherName(user.displayName || user.email || "");
        setDelivery((d) => ({ ...d, recipientName: user.displayName || "" }));
        // Redirect to onboarding if not completed
        if (!data.onboardingCompleted) {
          router.replace("/onboarding");
        }
      }
    };
    checkTeacherAndOnboarding();
  }, [user, authLoading, router]);

  // ── Load data ──
  useEffect(() => {
    if (!user || isTeacherUser !== true) return;

    async function loadData() {
      try {
        const [combosData, prodsSnap, catsSnap] = await Promise.all([
          getMeetingCombos(),
          getDocs(query(collection(db, "products"), limit(50))),
          getDocs(collection(db, "categories")),
        ]);
        setCombos(combosData);
        const allProds = prodsSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Product))
          .filter((p) => p.available !== false);
        setProducts(allProds);
        // Build category ID → name map
        const catMap: Record<string, string> = {};
        catsSnap.docs.forEach((d) => {
          const data = d.data();
          catMap[d.id] = (data.name || data.nombre || d.id).toLowerCase();
        });
        setCategoryMap(catMap);
      } catch (err) {
        console.error("[TeacherOrders] Error loading data:", err);
      } finally {
        setLoadingData(false);
      }
    }
    loadData();
  }, [user, isTeacherUser]);

  // ── Get products for a slot ──
  // If Brain has configured specific options with productIds, use those.
  // Otherwise fall back to keyword-based category filtering.
  const getProductsForSlot = useCallback(
    (slotCategory: string, slotOptions?: ComboSlotOption[]): Product[] => {
      // If specific products were configured in Brain, use only those
      if (slotOptions && slotOptions.length > 0) {
        const hasProductIds = slotOptions.some((o) => o.productId);
        if (hasProductIds) {
          const optionIds = new Set(slotOptions.map((o) => o.productId).filter(Boolean));
          const matched = products.filter((p) => optionIds.has(p.id));
          if (matched.length > 0) return matched;
        }
      }
      // Fallback: keyword-based category filtering
      const keywords = SLOT_CATEGORY_KEYWORDS[slotCategory] || [];
      if (keywords.length === 0) return products;
      return products.filter((p) => {
        const catName = categoryMap[p.category] || "";
        const productNameLower = p.name.toLowerCase();
        return keywords.some(
          (kw) => catName.includes(kw) || productNameLower.includes(kw)
        );
      });
    },
    [products, categoryMap]
  );

  // ── Create PaymentIntent when delivery form opens ──
  useEffect(() => {
    if (!showDeliveryForm || !user || total <= 0) {
      // Reset Stripe state when form closes
      if (!showDeliveryForm) {
        setClientSecret(null);
        setStripeError(null);
      }
      return;
    }

    const amountInCents = Math.round(total * 100);
    if (amountInCents < 50) return; // Stripe minimum

    let cancelled = false;

    async function createIntent() {
      if (!user) return;
      setLoadingIntent(true);
      setStripeError(null);

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
          throw new Error(data.error || "Error al crear la intención de pago");
        }
        if (!cancelled) setClientSecret(data.clientSecret);
      } catch (err: unknown) {
        if (!cancelled) setStripeError(err instanceof Error ? err.message : "Error desconocido");
      } finally {
        if (!cancelled) setLoadingIntent(false);
      }
    }

    createIntent();
    return () => { cancelled = true; };
  }, [showDeliveryForm, user, total]);

  // ── Listen to orders ──
  useEffect(() => {
    if (!user || isTeacherUser !== true) return;
    const unsub = listenTeacherOrders(user.uid, setOrders);
    return () => unsub();
  }, [user, isTeacherUser]);

  // ── Open combo configurator ──
  const openComboConfig = useCallback((combo: MeetingCombo) => {
    const slots = combo.slots || [];
    setActiveComboConfig({
      comboId: combo.id,
      slotSelections: slots.map((slot) => {
        // Pre-select the first real product for each unit
        const slotProducts = getProductsForSlot(slot.category, slot.options);
        const firstId = slotProducts[0]?.id || "";
        return Array.from({ length: slot.quantity }, () => firstId);
      }),
    });
  }, [getProductsForSlot]);

  // ── Update a slot choice ──
  const updateSlotChoice = useCallback(
    (slotIdx: number, unitIdx: number, productId: string) => {
      setActiveComboConfig((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, slotSelections: prev.slotSelections.map((s) => [...s]) };
        updated.slotSelections[slotIdx][unitIdx] = productId;
        return updated;
      });
    },
    []
  );

  // ── Confirm combo and add to cart ──
  const confirmCombo = useCallback(() => {
    if (!activeComboConfig) return;
    const combo = combos.find((c) => c.id === activeComboConfig.comboId);
    if (!combo) return;

    // Build items from real product selections
    const comboItems: TeacherOrderItem[] = [];
    const slotChoices: { slotLabel: string; choiceName: string }[] = [];

    (combo.slots || []).forEach((slot, si) => {
      activeComboConfig.slotSelections[si].forEach((productId) => {
        const product = products.find((p) => p.id === productId);
        if (product) {
          // Check if this product is already in comboItems — if so, increment qty
          const existing = comboItems.find((item) => item.productId === product.id);
          if (existing) {
            existing.qty += 1;
          } else {
            comboItems.push({
              productId: product.id,
              productName: product.name,
              unitPrice: product.price,
              qty: 1,
              isCombo: true,
              comboId: combo.id,
            });
          }
          slotChoices.push({
            slotLabel: isEn ? slot.label_en || slot.label : slot.label,
            choiceName: isEn ? product.name_en || product.name : product.name,
          });
        }
      });
    });

    // Add all combo items with slot choices on the first one
    if (comboItems.length > 0) {
      comboItems[0].slotChoices = slotChoices;
    }

    setSelectedItems((prev) => [...prev, ...comboItems]);
    setActiveComboConfig(null);
    // Go directly to delivery/payment form
    setShowDeliveryForm(true);
    toast.success(isEn ? `${combo.name_en || combo.name} added!` : `¡${combo.name} añadido!`);
  }, [activeComboConfig, combos, products, isEn]);

  // ── Add product to custom order ──
  const addProduct = useCallback(
    (product: Product) => {
      const item: TeacherOrderItem = {
        productId: product.id,
        productName: product.name,
        unitPrice: product.price,
        qty: 1,
      };
      setSelectedItems((prev) => {
        const existing = prev.findIndex((i) => i.productId === product.id && !i.isCombo);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = { ...updated[existing], qty: updated[existing].qty + 1 };
          return updated;
        }
        return [...prev, item];
      });
    },
    []
  );

  // ── Update qty ──
  const updateQty = useCallback((index: number, delta: number) => {
    setSelectedItems((prev) => {
      const updated = [...prev];
      const newQty = updated[index].qty + delta;
      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = { ...updated[index], qty: newQty };
      }
      return updated;
    });
  }, []);

  // ── Validate delivery form ──
  const validateDelivery = (): boolean => {
    if (!delivery.locationDetail.trim()) {
      toast.error(isEn ? "Please specify the delivery location" : "Indica el lugar de entrega");
      return false;
    }
    if (!delivery.deliveryTime) {
      toast.error(isEn ? "Please select a delivery time" : "Selecciona la hora de entrega");
      return false;
    }
    if (!delivery.recipientName.trim()) {
      toast.error(isEn ? "Please enter the recipient name" : "Indica a nombre de quién va el pedido");
      return false;
    }
    return true;
  };

  // ── Ref for selected items (avoid stale closures in payment form) ──
  const selectedItemsRef = useRef(selectedItems);
  useEffect(() => { selectedItemsRef.current = selectedItems; }, [selectedItems]);

  // ── Submit order after Stripe payment succeeds ──
  const handleStripeSuccess = useCallback(async (paymentIntentId: string) => {
    if (!user) return;

    setSubmitting(true);
    try {
      await createTeacherOrder({
        teacherUid: user.uid,
        teacherName: user.displayName || user.email || "",
        teacherEmail: user.email || "",
        items: selectedItemsRef.current,
        delivery: {
          ...delivery,
          attendees: customAttendees,
        },
        total,
        paymentMethod,
        paymentIntentId,
      });

      toast.success(isEn ? "Order placed and paid!" : "¡Pedido pagado y enviado!");
      setSelectedItems([]);
      setShowDeliveryForm(false);
      setActiveTab("orders");
    } catch (err) {
      console.error("[TeacherOrders] Submit error:", err);
      toast.error(isEn ? "Payment succeeded but error saving order. Contact support." : "Pago realizado pero error al guardar. Contacta soporte.");
    } finally {
      setSubmitting(false);
    }
  }, [user, delivery, customAttendees, total, paymentMethod, isEn]);

  // ── Helper: compute combo display price ──
  const getComboPrice = (combo: MeetingCombo) => combo.basePrice ?? combo.price ?? 0;

  // ── Helper: compute min / max price including slot option upgrades ──
  // Un combo con opciones "con leche de avena (+0.50€)" o similares puede variar
  // en precio según lo que elijas. Devolvemos min y max para mostrar "Desde X €".
  const getComboPriceRange = (combo: MeetingCombo): { min: number; max: number; hasVariance: boolean } => {
    const base = getComboPrice(combo);
    const slots = combo.slots || [];
    let extraMin = 0;
    let extraMax = 0;
    for (const slot of slots) {
      if (!slot.options || slot.options.length === 0) continue;
      const extras = slot.options.map((o) => o.extraPrice || 0);
      const qty = slot.quantity || 1;
      extraMin += Math.min(...extras) * qty;
      extraMax += Math.max(...extras) * qty;
    }
    const min = base + extraMin;
    const max = base + extraMax;
    return { min, max, hasVariance: max > min };
  };

  // ── Helper: formato de precio en es-ES (coma decimal) ──
  const formatPrice = (n: number) =>
    n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Loading states ──
  if (authLoading || isTeacherUser === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
      </div>
    );
  }

  // ── Not a teacher ──
  if (isTeacherUser === false) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-up">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
          <AlertCircle className="h-10 w-10 text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-brand-900">
          {isEn ? "Teachers only" : "Solo para profesores"}
        </h2>
        <p className="text-sm text-brand-500 text-center max-w-xs">
          {isEn
            ? "This section is exclusive for teachers. If you are a teacher, make sure your account is registered as one."
            : "Esta sección es exclusiva para profesores. Si eres profesor/a, asegúrate de que tu cuenta esté registrada como tal."}
        </p>
        <Link
          href="/"
          className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm text-white hover:bg-leaf-700 transition-colors"
        >
          {isEn ? "Back to menu" : "Volver a la carta"}
        </Link>
      </div>
    );
  }

  // ── Time restriction: only active 9:00–13:00 ──
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;
  const isWithinServiceHours = currentTimeMinutes >= 540 && currentTimeMinutes < 780; // 9:00 to 13:00

  // ── Find active combo for configurator ──
  const configCombo = activeComboConfig
    ? combos.find((c) => c.id === activeComboConfig.comboId)
    : null;

  // ── Outside service hours ──
  if (!isWithinServiceHours) {
    return (
      <div className="space-y-5 pb-8 animate-fade-up">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-brand-100 rounded-lg transition-colors">
            <ArrowLeft className="h-5 w-5 text-brand-600" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-brand-900">
              Delivery
            </h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
            <Clock className="h-10 w-10 text-amber-500" />
          </div>
          <h2 className="text-lg font-bold text-brand-900 text-center">
            {isEn ? "Outside delivery hours" : "Fuera del horario de entrega"}
          </h2>
          <p className="text-sm text-brand-500 text-center max-w-xs">
            {isEn
              ? "Teacher orders are available from 9:00 to 13:00. Come back during delivery hours!"
              : "Los pedidos para profesores están disponibles de 9:00 a 13:00. ¡Vuelve durante el horario de entregas!"}
          </p>
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-5 py-3 text-center">
            <p className="text-xs text-brand-400 uppercase tracking-wider font-medium">
              {isEn ? "Delivery hours" : "Horario de entregas"}
            </p>
            <p className="text-2xl font-bold text-leaf-700 mt-1">9:00 – 13:00</p>
          </div>
          <Link
            href="/"
            className="rounded-full bg-leaf-600 px-6 py-2.5 text-sm text-white hover:bg-leaf-700 transition-colors mt-2"
          >
            {isEn ? "Back to menu" : "Volver a la carta"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="p-2 hover:bg-brand-100 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-brand-600" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-brand-900">
            Delivery
          </h1>
          <p className="text-xs text-brand-400">
            {isEn ? "Orders delivered to your classroom or office" : "Pedidos entregados en tu aula u oficina"}
          </p>
        </div>
      </div>

      {/* Disclaimer — order in advance */}
      <div className="rounded-2xl border border-blue-200/70 bg-blue-50/50 p-3.5">
        <div className="flex items-start gap-2.5">
          <Clock className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            {isEn
              ? "Please place your order 5–10 minutes in advance to allow time for preparation and avoid delays."
              : "Por favor, realiza tu pedido con 5–10 minutos de antelación para que podamos prepararlo a tiempo y evitar retrasos."}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 rounded-xl bg-brand-100 p-1">
        {(
          [
            { id: "combos" as TabType, label: "Mini Combos", labelEn: "Mini Combos", icon: Coffee },
            { id: "custom" as TabType, label: "Personalizado", labelEn: "Custom", icon: Sparkles },
            { id: "orders" as TabType, label: "Mis pedidos", labelEn: "My orders", icon: Package },
          ] as const
        ).map(({ id, label, labelEn, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-all ${
              activeTab === id
                ? "bg-white text-brand-900 shadow-sm"
                : "text-brand-500 hover:text-brand-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {isEn ? labelEn : label}
          </button>
        ))}
      </div>

      {/* ════ COMBOS TAB ════ */}
      {activeTab === "combos" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200/70 bg-amber-50/50 p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {isEn ? "Mini combos — you choose!" : "Mini combos — ¡tú eliges!"}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  {isEn
                    ? "Pick a combo, then customize each drink and snack"
                    : "Elige un combo y personaliza cada bebida y snack"}
                </p>
              </div>
            </div>
          </div>

          {loadingData ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-32 w-full rounded-2xl" />
              ))}
            </div>
          ) : combos.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="h-12 w-12 text-brand-300 mx-auto mb-3" />
              <p className="text-sm text-brand-500">
                {isEn ? "Mini combos coming soon!" : "¡Mini combos próximamente!"}
              </p>
              <button
                onClick={() => setActiveTab("custom")}
                className="mt-4 rounded-full bg-leaf-600 px-5 py-2 text-sm text-white hover:bg-leaf-700"
              >
                {isEn ? "Create custom order" : "Crear pedido personalizado"}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {combos.map((combo) => {
                const { min: priceMin, max: priceMax, hasVariance } = getComboPriceRange(combo);
                const slots = combo.slots || [];
                return (
                  <div
                    key={combo.id}
                    className="rounded-2xl border border-brand-200/70 bg-white p-4 transition-all hover:shadow-md"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-brand-900">
                            {isEn ? combo.name_en || combo.name : combo.name}
                          </h3>
                          {combo.popular && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Popular
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-brand-500 mt-0.5">
                          {isEn ? combo.description_en || combo.description : combo.description}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {hasVariance ? (
                          <>
                            <p className="text-[10px] uppercase tracking-wide text-brand-400 leading-none">
                              {isEn ? "From" : "Desde"}
                            </p>
                            <p className="text-lg font-bold text-leaf-700 leading-tight">
                              {formatPrice(priceMin)} €
                            </p>
                            <p className="text-[10px] text-brand-400 leading-none" title={isEn ? "Final price depends on drinks/upgrades selected" : "El precio final depende de las bebidas u opciones que elijas"}>
                              {isEn ? `up to ${formatPrice(priceMax)} €` : `hasta ${formatPrice(priceMax)} €`}
                            </p>
                          </>
                        ) : (
                          <p className="text-lg font-bold text-leaf-700">{formatPrice(priceMin)} €</p>
                        )}
                        <p className="text-[10px] text-brand-400 flex items-center gap-1 justify-end mt-1">
                          <Users className="h-3 w-3" />
                          {isEn ? `${combo.servesUpTo} people` : `${combo.servesUpTo} pers.`}
                        </p>
                      </div>
                    </div>

                    {/* Slot summary pills */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {slots.map((slot, si) => (
                        <span
                          key={si}
                          className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] text-brand-600 font-medium"
                        >
                          {slot.quantity}× {isEn ? slot.label_en || slot.label : slot.label}
                          <span className="text-brand-400 ml-1">
                            ({slot.options.length} {isEn ? "options" : "opciones"})
                          </span>
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={() => openComboConfig(combo)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-leaf-600 py-2.5 text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98] transition-all"
                    >
                      {isEn ? "Customize & add" : "Personalizar y añadir"}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════ COMBO CONFIGURATOR SHEET ════ */}
      {activeComboConfig && configCombo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setActiveComboConfig(null)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-brand-200 max-h-[90vh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-brand-100 rounded-t-3xl">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-brand-900">
                    {isEn ? configCombo.name_en || configCombo.name : configCombo.name}
                  </h2>
                  <p className="text-xs text-brand-400">
                    {isEn ? "Choose what goes in your combo" : "Elige qué lleva tu combo"}
                  </p>
                </div>
                <button
                  onClick={() => setActiveComboConfig(null)}
                  className="p-2 hover:bg-brand-100 rounded-lg"
                >
                  <X className="h-5 w-5 text-brand-400" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-6">
              {(configCombo.slots || []).map((slot: ComboSlot, slotIdx: number) => {
                const slotProducts = getProductsForSlot(slot.category, slot.options);
                return (
                  <div key={slotIdx}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3 flex items-center gap-2">
                      {slot.category === "beverage" ? (
                        <Coffee className="h-4 w-4" />
                      ) : (
                        <Package className="h-4 w-4" />
                      )}
                      {isEn
                        ? `Choose ${slot.quantity} ${slot.label_en || slot.label}`
                        : `Elige ${slot.quantity} ${slot.label}`}
                    </p>

                    {slotProducts.length === 0 ? (
                      <p className="text-sm text-brand-400 italic py-2">
                        {isEn ? "No products available for this category" : "No hay productos disponibles en esta categoría"}
                      </p>
                    ) : (
                      /* One selector per unit in this slot */
                      Array.from({ length: slot.quantity }, (_, unitIdx) => {
                        const selectedProductId = activeComboConfig.slotSelections[slotIdx]?.[unitIdx] ?? "";
                        return (
                          <div key={unitIdx} className="mb-3">
                            <p className="text-[11px] text-brand-400 mb-1.5 font-medium">
                              {isEn
                                ? `${slot.label_en || slot.label} #${unitIdx + 1}`
                                : `${slot.label} #${unitIdx + 1}`}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {slotProducts.map((product) => {
                                const isSelected = selectedProductId === product.id;
                                return (
                                  <button
                                    key={product.id}
                                    onClick={() => updateSlotChoice(slotIdx, unitIdx, product.id)}
                                    className={`rounded-xl border-2 px-3 py-2 text-sm font-medium transition-all ${
                                      isSelected
                                        ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                                        : "border-brand-200 bg-white text-brand-600 hover:border-brand-300"
                                    }`}
                                  >
                                    {isEn ? product.name_en || product.name : product.name}
                                    <span className="text-[10px] text-brand-400 ml-1">
                                      {product.price.toFixed(2)}€
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}

              {/* Price summary */}
              {(() => {
                let itemsTotal = 0;
                (configCombo.slots || []).forEach((_slot: ComboSlot, si: number) => {
                  activeComboConfig.slotSelections[si]?.forEach((productId: string) => {
                    const product = products.find((p) => p.id === productId);
                    if (product) itemsTotal += product.price;
                  });
                });

                return (
                  <div className="rounded-xl border border-brand-200/70 bg-brand-50 p-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-brand-500">{isEn ? "Selected items" : "Productos seleccionados"}</span>
                      <span className="font-medium text-brand-700">
                        {(configCombo.slots || []).reduce((sum, s) => sum + s.quantity, 0)} {isEn ? "items" : "uds."}
                      </span>
                    </div>
                    <div className="flex justify-between mt-2 pt-2 border-t border-brand-200">
                      <span className="font-semibold text-brand-900">Total</span>
                      <span className="text-lg font-bold text-leaf-700">{itemsTotal.toFixed(2)} €</span>
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={confirmCombo}
                className="w-full rounded-2xl bg-leaf-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                <Check className="h-4 w-4" />
                {isEn ? "Add to order" : "Añadir al pedido"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ CUSTOM TAB ════ */}
      {activeTab === "custom" && (
        <div className="space-y-4">
          {/* Attendees selector */}
          <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              {isEn ? "Number of attendees" : "Número de asistentes"}
            </p>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setCustomAttendees(Math.max(1, customAttendees - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="text-2xl font-bold text-brand-900 tabular-nums w-12 text-center">
                {customAttendees}
              </span>
              <button
                onClick={() => setCustomAttendees(Math.min(50, customAttendees + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Products list */}
          <div className="rounded-2xl border border-brand-200/70 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3 flex items-center gap-2">
              <Coffee className="h-4 w-4" />
              {isEn ? "Add products" : "Añadir productos"}
            </p>
            {loadingData ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="skeleton h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {products.map((product) => {
                  const inCart = selectedItems.find(
                    (i) => i.productId === product.id && !i.isCombo
                  );
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                        inCart
                          ? "border-leaf-300 bg-leaf-50/50"
                          : "border-brand-200/70 bg-white hover:border-brand-300"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-brand-900 truncate">
                          {translateProduct(product.name, locale, product.name_en)}
                        </p>
                        <p className="text-xs text-brand-400 tabular-nums">
                          {product.price.toFixed(2)} €
                        </p>
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const idx = selectedItems.findIndex(
                                (i) => i.productId === product.id && !i.isCombo
                              );
                              if (idx >= 0) updateQty(idx, -1);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 bg-white text-brand-600"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="text-sm font-bold text-brand-900 w-6 text-center tabular-nums">
                            {inCart.qty}
                          </span>
                          <button
                            onClick={() => {
                              const idx = selectedItems.findIndex(
                                (i) => i.productId === product.id && !i.isCombo
                              );
                              if (idx >= 0) updateQty(idx, 1);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-600 text-white"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addProduct(product)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-leaf-600 text-white hover:bg-leaf-700"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ ORDERS TAB ════ */}
      {activeTab === "orders" && (
        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="h-12 w-12 text-brand-300 mx-auto mb-3" />
              <p className="text-sm text-brand-500">
                {isEn ? "No orders yet" : "Aún no tienes pedidos"}
              </p>
              <p className="text-xs text-brand-400 mt-1">
                {isEn ? "Your orders will appear here" : "Tus pedidos aparecerán aquí"}
              </p>
            </div>
          ) : (
            orders.map((order) => {
              const statusConf = STATUS_CONFIG[order.status] || STATUS_CONFIG.CREATED;
              const isActive = !["DELIVERED", "CANCELLED", "PICKED_UP", "CANCELED"].includes(order.status);
              return (
                <div
                  key={order.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    isActive
                      ? "border-leaf-200 bg-leaf-50/30"
                      : "border-brand-200/70 bg-white"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${statusConf.color}`}
                      >
                        {statusConf.icon} {isEn ? statusConf.labelEn : statusConf.label}
                      </span>
                      <p className="text-[11px] text-brand-400 mt-1">
                        {order.createdAt && "toDate" in order.createdAt
                          ? (order.createdAt as { toDate: () => Date }).toDate().toLocaleDateString(locale === "es" ? "es-ES" : "en-US", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-brand-900 tabular-nums">
                      {order.total.toFixed(2)} €
                    </p>
                  </div>

                  {/* Items summary */}
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {order.items.map((item, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] text-brand-600"
                      >
                        {item.qty}× {item.productName}
                      </span>
                    ))}
                  </div>

                  {/* Delivery info */}
                  <div className="flex gap-3 text-[11px] text-brand-400">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {order.delivery?.locationDetail || "-"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {order.delivery?.deliveryTime || "-"}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {order.delivery?.recipientName || "-"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ════ FLOATING CART BAR ════ */}
      {selectedItems.length > 0 && activeTab !== "orders" && !showDeliveryForm && !activeComboConfig && (
        <div className="fixed bottom-20 left-0 right-0 z-50 px-4">
          <div className="mx-auto max-w-lg">
            <button
              onClick={() => setShowDeliveryForm(true)}
              className="w-full flex items-center justify-between gap-3 rounded-2xl bg-leaf-600 px-5 py-4 text-white shadow-xl shadow-leaf-600/30 hover:bg-leaf-700 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
                  {selectedItems.reduce((s, i) => s + i.qty, 0)}
                </div>
                <span className="font-semibold text-sm">
                  {isEn ? "Continue to delivery" : "Continuar con la entrega"}
                </span>
              </div>
              <span className="font-bold text-base tabular-nums">{total.toFixed(2)} €</span>
            </button>
          </div>
        </div>
      )}

      {/* ════ DELIVERY FORM SHEET ════ */}
      {showDeliveryForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-up p-4"
          onClick={() => setShowDeliveryForm(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-brand-200 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white z-10 px-5 pt-5 pb-3 border-b border-brand-100 rounded-t-3xl">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold text-brand-900">
                  {isEn ? "Delivery details" : "Detalles de entrega"}
                </h2>
                <button
                  onClick={() => setShowDeliveryForm(false)}
                  className="text-xs text-brand-400 hover:text-brand-600"
                >
                  {isEn ? "Cancel" : "Cancelar"}
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Order summary */}
              <div className="rounded-xl border border-brand-200/70 bg-brand-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-2">
                  {isEn ? "Your order" : "Tu pedido"}
                </p>
                {selectedItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm py-1">
                    <div className="text-brand-700">
                      <span className="font-medium">{item.qty}×</span> {item.productName}
                      {item.isCombo && (
                        <span className="text-[10px] ml-1 text-amber-600">(Combo)</span>
                      )}
                      {/* Show slot choices for combos */}
                      {item.slotChoices && item.slotChoices.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {item.slotChoices.map((sc, scIdx) => (
                            <span
                              key={scIdx}
                              className="text-[10px] bg-brand-100 rounded px-1.5 py-0.5 text-brand-500"
                            >
                              {sc.choiceName}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="font-medium text-brand-800 tabular-nums shrink-0 ml-2">
                      {(item.unitPrice * item.qty).toFixed(2)} €
                    </span>
                  </div>
                ))}
                <div className="mt-2 border-t border-brand-200 pt-2 flex justify-between">
                  <span className="font-semibold text-brand-900">Total</span>
                  <span className="text-lg font-bold text-leaf-700">{total.toFixed(2)} €</span>
                </div>
              </div>

              {/* Location type */}
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <MapPin className="h-3.5 w-3.5 inline mr-1" />
                  {isEn ? "Delivery location" : "Lugar de entrega"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LOCATION_OPTIONS.map(({ value, label, labelEn, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setDelivery((d) => ({ ...d, location: value }))}
                      className={`flex items-center gap-2 rounded-xl border-2 p-3 text-sm font-medium transition-all ${
                        delivery.location === value
                          ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                          : "border-brand-200 bg-white text-brand-500 hover:border-brand-300"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {isEn ? labelEn : label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location detail */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  {isEn ? "Specific location" : "Ubicación específica"} *
                </label>
                <input
                  type="text"
                  value={delivery.locationDetail}
                  onChange={(e) =>
                    setDelivery((d) => ({ ...d, locationDetail: e.target.value }))
                  }
                  placeholder={
                    isEn ? "e.g., Room 204, Building B" : "Ej: Aula 204, Edificio B"
                  }
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400"
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                    <Clock className="h-3.5 w-3.5 inline mr-1" />
                    {isEn ? "Date" : "Fecha"} *
                  </label>
                  <input
                    type="date"
                    value={delivery.deliveryDate}
                    onChange={(e) =>
                      setDelivery((d) => ({ ...d, deliveryDate: e.target.value }))
                    }
                    min={new Date().toISOString().split("T")[0]}
                    className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-leaf-400"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                    {isEn ? "Time" : "Hora"} *
                  </label>
                  <input
                    type="time"
                    value={delivery.deliveryTime}
                    onChange={(e) =>
                      setDelivery((d) => ({ ...d, deliveryTime: e.target.value }))
                    }
                    min="07:30"
                    max="20:00"
                    className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 focus:outline-none focus:ring-2 focus:ring-leaf-400"
                  />
                </div>
              </div>

              {/* Recipient */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <User className="h-3.5 w-3.5 inline mr-1" />
                  {isEn ? "Recipient name" : "A nombre de"} *
                </label>
                <input
                  type="text"
                  value={delivery.recipientName}
                  onChange={(e) =>
                    setDelivery((d) => ({ ...d, recipientName: e.target.value }))
                  }
                  placeholder={isEn ? "Who receives the order?" : "¿Quién recibe el pedido?"}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400"
                />
              </div>

              {/* Department */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <Building2 className="h-3.5 w-3.5 inline mr-1" />
                  {isEn ? "Department (optional)" : "Departamento (opcional)"}
                </label>
                <input
                  type="text"
                  value={delivery.department || ""}
                  onChange={(e) =>
                    setDelivery((d) => ({ ...d, department: e.target.value }))
                  }
                  placeholder={
                    isEn
                      ? "Department paying for this order"
                      : "Departamento que asume el gasto"
                  }
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400"
                />
              </div>

              {/* Attendees */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <Users className="h-3.5 w-3.5 inline mr-1" />
                  {isEn ? "Number of attendees" : "Número de asistentes"}
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCustomAttendees(Math.max(1, customAttendees - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-lg font-bold text-brand-900 tabular-nums w-10 text-center">
                    {customAttendees}
                  </span>
                  <button
                    onClick={() => setCustomAttendees(Math.min(50, customAttendees + 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Contact phone */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <Phone className="h-3.5 w-3.5 inline mr-1" />
                  {isEn ? "Contact phone (optional)" : "Teléfono de contacto (opcional)"}
                </label>
                <input
                  type="tel"
                  value={delivery.contactPhone || ""}
                  onChange={(e) =>
                    setDelivery((d) => ({ ...d, contactPhone: e.target.value }))
                  }
                  placeholder={isEn ? "In case we need to reach you" : "Por si necesitamos contactarte"}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <FileText className="h-3.5 w-3.5 inline mr-1" />
                  {isEn ? "Additional notes" : "Notas adicionales"}
                </label>
                <textarea
                  value={delivery.notes || ""}
                  onChange={(e) =>
                    setDelivery((d) => ({ ...d, notes: e.target.value.slice(0, 300) }))
                  }
                  placeholder={
                    isEn
                      ? "Special requests, allergies, etc."
                      : "Peticiones especiales, alergias, etc."
                  }
                  rows={2}
                  maxLength={300}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400 resize-none"
                />
                <p className="text-[11px] text-brand-400 mt-1 text-right">
                  {(delivery.notes || "").length}/300
                </p>
              </div>

              {/* Stripe Payment Section */}
              <div className="rounded-xl border border-brand-200/70 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-3 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  {isEn ? "Payment" : "Pago"}
                </p>

                {stripeError && (
                  <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                    {stripeError}
                  </div>
                )}

                {loadingIntent ? (
                  <div className="flex items-center justify-center py-6 gap-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
                    <span className="text-sm text-brand-400">
                      {isEn ? "Loading payment..." : "Cargando pago..."}
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
                    <TeacherPaymentForm
                      total={total}
                      isEn={isEn}
                      submitting={submitting}
                      validateDelivery={validateDelivery}
                      onPaymentSuccess={handleStripeSuccess}
                      userEmail={user?.email || ""}
                    />
                  </Elements>
                ) : !loadingIntent && !stripeError ? (
                  <p className="py-4 text-center text-sm text-brand-400">
                    {isEn ? "Error loading payment" : "Error al cargar el pago"}
                  </p>
                ) : null}
              </div>

              <p className="text-center text-[11px] text-brand-300 pb-4">
                {isEn
                  ? "Secure transaction with Stripe"
                  : "Transacción segura con Stripe"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
