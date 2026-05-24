"use client";

import Link from "next/link";
import { Coffee, Sparkles } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useLanguage } from "@/components/language-provider";
import { LanguageSelector } from "@/components/language-selector";

export function AppHeader() {
  const { user } = useAuth();
  const { t, locale } = useLanguage();

  return (
    <header className="sticky top-0 z-50 border-b border-brand-200/40 bg-brand-50/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-900 shadow-sm">
            <Coffee className="h-5 w-5 text-brand-50" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold tracking-tight text-brand-900">Raíz y Grano</span>
        </Link>
        <div className="flex items-center gap-1.5">
          {/* Acceso rápido al Bono Exámenes. Solo si hay sesión:
              sin user no hay bono que gestionar. */}
          {user && (
            <Link
              href="/bono"
              aria-label={locale === "es" ? "Bono Exámenes" : "Exam Pass"}
              className="inline-flex items-center gap-1 rounded-full border border-leaf-300 bg-leaf-50 px-2.5 py-1 text-xs font-medium text-leaf-700 transition-colors hover:bg-leaf-100"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">
                {locale === "es" ? "Bono" : "Pass"}
              </span>
            </Link>
          )}
          <LanguageSelector />
          {user ? (
            <Link href="/profile" aria-label="User menu" className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-50 text-leaf-700 text-xs font-semibold transition-colors hover:bg-leaf-100">
              {user.displayName?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || "?"}
            </Link>
          ) : (
            <Link href="/login" className="rounded-lg bg-leaf-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-leaf-700">
              {t("header.signin")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
