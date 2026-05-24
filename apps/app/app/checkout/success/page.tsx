"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/components/auth-provider";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Coffee, MapPin, Heart, Star, ArrowRight } from "lucide-react";

// Sanitize user input to prevent XSS: strip HTML tags and normalize whitespace
function sanitizeFeedbackComment(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')  // Remove HTML tags
    .replace(/\s+/g, ' ')     // Normalize whitespace
    .trim();
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}

function SuccessContent() {
  const [show, setShow] = useState(false);
  const { t } = useLanguage();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") || "";
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const tm = setTimeout(() => setShow(true), 100);
    return () => clearTimeout(tm);
  }, []);

  const submitFeedback = async () => {
    if (!rating && !comment.trim()) return;
    setSending(true);
    try {
      // SECURITY: Sanitize feedback comment to prevent XSS in dashboard
      const sanitizedComment = sanitizeFeedbackComment(comment);
      await addDoc(collection(db, "feedback"), {
        rating,
        comment: sanitizedComment || null,
        customerUid: user?.uid || null,
        customerEmail: user?.email || null,
        source: "APP",
        page: "post_checkout",
        createdAt: serverTimestamp(),
      });
      setSent(true);
    } catch (e) {
      console.error(e);
      setSent(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-center py-16 gap-6">
      {/* Success Checkmark */}
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full transition-all duration-700 ${
          show ? "bg-leaf-50 scale-100 opacity-100" : "bg-leaf-50 scale-50 opacity-0"
        } border-2 border-leaf-200`}
      >
        <svg
          className={`h-12 w-12 text-leaf-600 transition-all duration-500 delay-300 ${
            show ? "scale-100 opacity-100" : "scale-0 opacity-0"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      {/* Title & Subtitle */}
      <div
        className={`text-center transition-all duration-500 delay-500 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <h1 className="text-2xl font-bold text-brand-900">{t("success.title") || "Pedido confirmado"}</h1>
        <p className="mt-2 text-sm text-brand-500 max-w-xs mx-auto">
          {t("success.subtitle") || "Recibirás una notificación cuando tu pedido esté listo"}
        </p>
        {orderId && (
          <p className="mt-3 text-xs font-mono text-brand-400">
            {t("success.orderid") || "Pedido"} #{orderId.slice(-6).toUpperCase()}
          </p>
        )}
      </div>

      {/* Status Cards */}
      <div
        className={`w-full max-w-xs space-y-3 transition-all duration-500 delay-700 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="flex items-center gap-3 rounded-2xl bg-leaf-50 border border-leaf-200 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-leaf-100">
            <Coffee className="h-5 w-5 text-leaf-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-leaf-900">{t("success.preparing") || "Preparando"}</p>
            <p className="text-xs text-leaf-600">
              {t("success.notify") || "Te notificaremos cuando esté listo"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl bg-brand-50 border border-brand-200 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <MapPin className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-brand-900">{t("success.pickup") || "Recogida"}</p>
            <p className="text-xs text-brand-500">
              {t("success.show") || "Presenta este pedido en mostrador"}
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Section */}
      <div
        className={`w-full max-w-xs transition-all duration-500 delay-900 ${
          show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        <div className="rounded-2xl border border-brand-200/70 bg-white p-5">
          {sent ? (
            <div className="text-center py-6">
              <div className="flex justify-center mb-3">
                <Heart className="h-8 w-8 text-leaf-600" />
              </div>
              <p className="text-sm font-semibold text-leaf-700">
                {t("success.feedback.thanks") || "¡Gracias por tu feedback!"}
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-400 mb-1">
                {t("success.feedback.title") || "Tu opinión"}
              </p>
              <p className="text-[11px] text-brand-400 mb-4">
                {t("success.feedback.subtitle") || "Ayúdanos a mejorar tu experiencia"}
              </p>

              <p className="text-xs text-brand-500 mb-3 font-medium">
                {t("success.feedback.rate") || "Califica tu experiencia"}
              </p>

              {/* Star Rating */}
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    aria-label={t("success.feedback.rate") ? `${t("success.feedback.rate")} ${star}` : `Rate ${star} stars`}
                    className={`p-1 rounded-lg transition-all ${
                      rating === star
                        ? "bg-leaf-100 scale-110"
                        : "hover:bg-brand-50"
                    }`}
                  >
                    <Star
                      className={`h-6 w-6 transition-colors ${
                        rating && rating >= star
                          ? "fill-leaf-600 text-leaf-600"
                          : "text-brand-300"
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 500))}
                  placeholder={t("success.feedback.placeholder") || "Cuéntanos qué te pareció..."}
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-sm text-brand-900 placeholder:text-brand-300 focus:outline-none focus:ring-2 focus:ring-leaf-400 resize-none"
                />
                <p className="text-[10px] text-brand-400 mt-1 text-right">
                  {comment.length}/500
                </p>
              </div>
              <div className="mb-4" />

              <button
                onClick={submitFeedback}
                disabled={sending || (!rating && !comment.trim())}
                className={`w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                  sending || (!rating && !comment.trim())
                    ? "bg-brand-300 cursor-not-allowed"
                    : "bg-leaf-600 hover:bg-leaf-700 active:scale-[0.98]"
                }`}
              >
                {sending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    {t("success.feedback.sending") || "Enviando..."}
                  </>
                ) : (
                  <>
                    {t("success.feedback.send") || "Enviar feedback"}
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </>
          )}
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
          className="block w-full rounded-2xl bg-leaf-600 py-4 text-center text-sm font-semibold text-white hover:bg-leaf-700 transition-colors active:scale-[0.98] shadow-lg shadow-leaf-600/20 flex items-center justify-center gap-2"
        >
          {t("success.orders") || "Ver mis pedidos"}
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/"
          className="block w-full rounded-2xl border border-brand-200 py-3.5 text-center text-sm font-semibold text-brand-600 hover:bg-brand-50 transition-colors active:scale-[0.98]"
        >
          {t("success.menu") || "Volver al menú"}
        </Link>
      </div>
    </div>
  );
}
