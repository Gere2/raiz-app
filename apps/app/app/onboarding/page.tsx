"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  Coffee,
  ShoppingBag,
  Award,
  Truck,
  MapPin,
  Phone,
  Building2,
  ChevronRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

interface Slide {
  key: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  textKey: string;
}

const BASE_SLIDES: Slide[] = [
  {
    key: "welcome",
    icon: Coffee,
    iconBg: "bg-brand-900",
    iconColor: "text-brand-50",
    titleKey: "onboarding.welcome.title",
    textKey: "onboarding.welcome.text",
  },
  {
    key: "order",
    icon: ShoppingBag,
    iconBg: "bg-leaf-600",
    iconColor: "text-white",
    titleKey: "onboarding.order.title",
    textKey: "onboarding.order.text",
  },
  {
    key: "loyalty",
    icon: Coffee,
    iconBg: "bg-amber-500",
    iconColor: "text-white",
    titleKey: "onboarding.loyalty.title",
    textKey: "onboarding.loyalty.text",
  },
  {
    key: "gamification",
    icon: Award,
    iconBg: "bg-purple-600",
    iconColor: "text-white",
    titleKey: "onboarding.gamification.title",
    textKey: "onboarding.gamification.text",
  },
];

const DELIVERY_SLIDE: Slide = {
  key: "delivery",
  icon: Truck,
  iconBg: "bg-blue-600",
  iconColor: "text-white",
  titleKey: "onboarding.delivery.title",
  textKey: "onboarding.delivery.text",
};

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTeacher, setIsTeacher] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Teacher delivery fields
  const [department, setDepartment] = useState("");
  const [defaultLocation, setDefaultLocation] = useState("");
  const [phone, setPhone] = useState("");

  // Touch swipe tracking
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // Check user type
  useEffect(() => {
    if (authLoading || !user) return;
    const check = async () => {
      try {
        const snap = await getDoc(doc(db, "customer_profiles", user.uid));
        if (snap.exists()) {
          setIsTeacher(snap.data().userType === "teacher");
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [user, authLoading]);

  const slides = isTeacher ? [...BASE_SLIDES, DELIVERY_SLIDE] : BASE_SLIDES;
  const isLastSlide = currentSlide === slides.length - 1;
  const isDeliverySlide = slides[currentSlide]?.key === "delivery";

  const goNext = useCallback(() => {
    if (!isLastSlide) setCurrentSlide((s) => s + 1);
  }, [isLastSlide]);

  const goPrev = useCallback(() => {
    if (currentSlide > 0) setCurrentSlide((s) => s - 1);
  }, [currentSlide]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goNext();
      else goPrev();
    }
    setTouchStart(null);
  };

  const finishOnboarding = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = { onboardingCompleted: true };
      if (isTeacher) {
        if (department.trim()) updateData.department = department.trim();
        if (defaultLocation.trim()) updateData.defaultLocation = defaultLocation.trim();
        if (phone.trim()) updateData.contactPhone = phone.trim();
      }
      await setDoc(doc(db, "customer_profiles", user.uid), updateData, { merge: true });
      router.push(isTeacher ? "/teacher-orders" : "/");
    } catch (err) {
      console.error("[Onboarding] Error:", err);
      toast.error("Error");
    } finally {
      setSaving(false);
    }
  };

  const skipOnboarding = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, "customer_profiles", user.uid), {
        onboardingCompleted: true,
      }, { merge: true });
    } catch {
      // ignore
    }
    router.push("/");
  };

  // Loading / auth
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  const slide = slides[currentSlide];
  const Icon = slide.icon;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-between px-4 pt-8 pb-6">
      {/* Skip button */}
      <div className="w-full max-w-sm flex justify-end">
        <button
          onClick={skipOnboarding}
          className="text-xs text-brand-400 hover:text-brand-600 transition-colors py-1 px-2"
        >
          {t("onboarding.skip")}
        </button>
      </div>

      {/* Slide content */}
      <div
        className="flex-1 flex flex-col items-center justify-center w-full max-w-sm"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div key={slide.key} className="text-center animate-fade-up">
          {/* Icon */}
          <div
            className={`mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl ${slide.iconBg} shadow-lg`}
          >
            <Icon className={`h-12 w-12 ${slide.iconColor}`} />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-brand-900 mb-3">
            {t(slide.titleKey)}
          </h1>

          {/* Text */}
          <p className="text-sm text-brand-500 leading-relaxed max-w-xs mx-auto">
            {t(slide.textKey)}
          </p>

          {/* Teacher delivery form (inline on delivery slide) */}
          {isDeliverySlide && (
            <div className="mt-6 space-y-3 text-left animate-fade-up" style={{ animationDelay: "0.1s" }}>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <Building2 className="h-3.5 w-3.5 inline mr-1" />
                  {t("onboarding.delivery.department")}
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder={t("onboarding.delivery.department.placeholder")}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-400/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <MapPin className="h-3.5 w-3.5 inline mr-1" />
                  {t("onboarding.delivery.location")}
                </label>
                <input
                  type="text"
                  value={defaultLocation}
                  onChange={(e) => setDefaultLocation(e.target.value)}
                  placeholder={t("onboarding.delivery.location.placeholder")}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-400/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                  <Phone className="h-3.5 w-3.5 inline mr-1" />
                  {t("onboarding.delivery.phone")}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t("onboarding.delivery.phone.placeholder")}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-400/20"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: dots + button */}
      <div className="w-full max-w-sm space-y-4">
        {/* Dots */}
        <div className="flex justify-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentSlide(i)}
              className={`h-2 rounded-full transition-all ${
                i === currentSlide
                  ? "w-6 bg-brand-900"
                  : "w-2 bg-brand-200 hover:bg-brand-300"
              }`}
            />
          ))}
        </div>

        {/* Action button */}
        {isLastSlide ? (
          <button
            onClick={finishOnboarding}
            disabled={saving}
            className="w-full rounded-2xl bg-leaf-600 py-3.5 text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-leaf-600/20 transition-all"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                {t("onboarding.saving")}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Sparkles className="h-4 w-4" />
                {t("onboarding.start")}
              </span>
            )}
          </button>
        ) : (
          <button
            onClick={goNext}
            className="w-full rounded-2xl bg-brand-900 py-3.5 text-sm font-semibold text-white hover:bg-brand-800 active:scale-[0.98] shadow-lg shadow-brand-900/20 transition-all"
          >
            <span className="flex items-center justify-center gap-2">
              {t("onboarding.next")}
              <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
