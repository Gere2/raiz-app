"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { useLanguage } from "@/components/language-provider";
import { useAuth } from "@/components/auth-provider";
import { useEffect, useState } from "react";
import { Coffee, ClipboardList, ShoppingBag, User, Truck } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function BottomNav() {
  const pathname = usePathname();
  const { totalItems } = useCart();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [pop, setPop] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  // Check if user is a teacher (re-check on navigation too)
  useEffect(() => {
    if (!user) { setIsTeacher(false); return; }
    const checkTeacher = async () => {
      try {
        const snap = await getDoc(doc(db, "customer_profiles", user.uid));
        if (snap.exists() && snap.data().userType === "teacher") {
          setIsTeacher(true);
        } else {
          setIsTeacher(false);
        }
      } catch { setIsTeacher(false); }
    };
    checkTeacher();
  }, [user, pathname]);

  useEffect(() => {
    if (totalItems > 0) {
      setPop(true);
      const tm = setTimeout(() => setPop(false), 300);
      return () => clearTimeout(tm);
    }
  }, [totalItems]);

  if (pathname === "/login" || pathname === "/checkout" || pathname === "/onboarding") return null;

  const items = [
    { href: "/", label: t("nav.menu"), icon: Coffee },
    { href: "/orders", label: t("nav.orders"), icon: ClipboardList },
    ...(isTeacher
      ? [{ href: "/teacher-orders", label: t("nav.teacher") || "Delivery", icon: Truck }]
      : []),
    { href: "/cart", label: t("nav.cart"), icon: ShoppingBag },
    { href: "/profile", label: t("nav.profile"), icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-brand-200/30 bg-white/90 backdrop-blur-xl safe-bottom">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-2">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isCart = href === "/cart";

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center gap-2 px-3 py-1.5 transition-colors ${
                isActive ? "text-brand-900" : "text-brand-400 hover:text-brand-600"
              }`}
            >
              <div className="relative">
                <Icon
                  className={`h-6 w-6 transition-transform ${isCart && pop ? "cart-pop" : ""}`}
                  strokeWidth={isActive ? 2.5 : 2}
                  fill={isActive ? "currentColor" : "none"}
                />
                {isCart && totalItems > 0 && (
                  <span
                    className={`absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-900 px-1 text-[10px] font-bold text-brand-50 shadow-sm ${
                      pop ? "cart-pop" : ""
                    }`}
                  >
                    {totalItems}
                  </span>
                )}
              </div>
              {isActive && <div className="h-[2px] w-5 bg-brand-900 rounded-full" />}
              <span
                className={`text-[10px] font-medium tracking-wide ${
                  isActive ? "text-brand-900" : "text-brand-400"
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
