"use client";
import { RAIZ_ORG_ID } from "@/lib/tenant";
import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from "firebase/auth";
import type { FirebaseError } from "firebase/app";
import { doc, setDoc, Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { generateNumericCode } from "@/lib/loyalty-points-service";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/components/language-provider";
import { toast } from "sonner";
import Link from "next/link";
import { Coffee } from "@/lib/icons";

type UserType = "student" | "teacher" | "other"

// Stricter email format validation
function isValidEmail(email: string): boolean {
  const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
  return emailRegex.test(email)
}

// Validate redirect URL to prevent open redirect attacks
function isValidRedirectUrl(url: string): boolean {
  // Must start with / but NOT //  (prevents protocol-relative URLs like //evil.com)
  if (!url.startsWith("/") || url.startsWith("//")) return false
  // Whitelist of allowed paths for additional defense-in-depth
  const allowedPaths = ["/", "/checkout", "/orders", "/profile", "/cart", "/teacher-orders", "/onboarding"]
  return allowedPaths.includes(url)
}

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [userType, setUserType] = useState<UserType>("student");
  const [isRegister, setIsRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; name?: string; server?: string }>({});
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // Validate redirect URL to prevent open redirect attacks
  const rawRedirect = searchParams.get("redirect") || "/";
  const redirect = isValidRedirectUrl(rawRedirect) ? rawRedirect : "/";
  const { t } = useLanguage();

  useEffect(() => {
    if (searchParams.get("mode") === "register") setIsRegister(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setInfoMsg(null);
    const newErrors: typeof errors = {};

    if (!email.trim()) newErrors.email = t("login.error.email");
    else if (!isValidEmail(email.trim())) newErrors.email = t("login.error.invalid");
    if (!password || password.length < 6) newErrors.password = t("login.error.password");
    if (isRegister && !name.trim()) newErrors.name = t("login.error.name");

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    try {
      setLoading(true);
      if (isRegister) {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });

        // Guardar tipo de usuario en customer_profiles
        try {
          await setDoc(doc(db, "customer_profiles", cred.user.uid), {
            id: cred.user.uid,
            uid: cred.user.uid,
            orgId: RAIZ_ORG_ID,
            type: "app",
            userType: userType,
            email: email.trim(),
            name: name.trim(),
            totalVisits: 0,
            totalSpent: 0,
            avgTicket: 0,
            favoriteProducts: [],
            preferredPaymentMethod: "",
            preferredTimeSlot: "",
            preferredDayOfWeek: 0,
            visitsByDayOfWeek: {},
            visitsByTimeSlot: {},
            paymentCounts: {},
            segment: "new",
            loyaltyPoints: 0,
            totalPointsEarned: 0,
            numericCode: generateNumericCode(cred.user.uid),
            pointsHistory: [],
            onboardingCompleted: false,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            lastVisit: Timestamp.now(),
            firstVisit: Timestamp.now(),
          }, { merge: true });
        } catch (err) {
          console.error("[Profile] Error creating:", err);
        }

        toast.success(t("login.welcome"));
        router.push("/onboarding");
        return;
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success(t("login.welcomeback"));
      }
      router.push(redirect);
    } catch (error: unknown) {
      const fb = error as FirebaseError;
      const code = typeof fb?.code === "string" ? fb.code : "";
      const msg =
        code === "auth/wrong-password" || code === "auth/user-not-found" ? t("login.error.wrong") :
        code === "auth/email-already-in-use" ? t("login.error.exists") :
        code === "auth/invalid-email" ? t("login.error.invalid") :
        code === "auth/weak-password" ? t("login.error.weak") :
        code === "auth/too-many-requests" ? t("login.error.toomany") :
        t("login.error.generic");
      setErrors({ server: msg });
    } finally {
      setLoading(false);
    }
  };

  // Recuperación de contraseña vía email nativo de Firebase (NO usa Resend).
  // Mensaje neutro siempre que la petición no falle por formato/rate-limit:
  // así no revelamos si un email existe o no (anti-enumeración).
  const handleForgotPassword = async () => {
    setInfoMsg(null);
    const mail = email.trim();
    if (!mail || !isValidEmail(mail)) {
      setErrors({ email: t("login.forgot.needEmail") });
      return;
    }
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, mail);
      setErrors({});
      setInfoMsg(t("login.forgot.sent"));
    } catch (error: unknown) {
      const fb = error as FirebaseError;
      const code = typeof fb?.code === "string" ? fb.code : "";
      if (code === "auth/too-many-requests") {
        setErrors({ server: t("login.error.toomany") });
      } else if (code === "auth/invalid-email") {
        setErrors({ email: t("login.error.invalid") });
      } else {
        // user-not-found u otros: mensaje neutro de "enviado" (anti-enumeración).
        setInfoMsg(t("login.forgot.sent"));
      }
    } finally {
      setLoading(false);
    }
  };

  const typeOptions: { value: UserType; labelKey: string }[] = [
    { value: "student", labelKey: "login.usertype.student" },
    { value: "teacher", labelKey: "login.usertype.teacher" },
    { value: "other", labelKey: "login.usertype.other" },
  ];

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center -mt-4 px-4">
      <div className="mb-8 text-center animate-fade-up">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-900 shadow-lg shadow-brand-900/20">
          <Coffee className="h-10 w-10 text-brand-50" />
        </div>
        <h1 className="text-2xl font-bold text-brand-900">Raíz y Grano</h1>
        <p className="mt-1 text-sm text-brand-400">{t("login.subtitle")}</p>
      </div>

      <div className="w-full max-w-sm animate-fade-up" style={{ animationDelay: "0.1s" }}>
        <div className="rounded-2xl border border-brand-200/70 bg-white p-6 shadow-sm">
          <div className="mb-6 flex rounded-xl bg-brand-100 p-1">
            <button type="button" onClick={() => setIsRegister(false)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${!isRegister ? "bg-white text-brand-900 shadow-sm" : "text-brand-500"}`}>
              {t("login.tab.signin")}
            </button>
            <button type="button" onClick={() => setIsRegister(true)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-all ${isRegister ? "bg-white text-brand-900 shadow-sm" : "text-brand-500"}`}>
              {t("login.tab.register")}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {errors.server && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700">
                {errors.server}
              </div>
            )}
            {infoMsg && (
              <div className="rounded-xl bg-leaf-50 border border-leaf-200 px-3 py-2.5 text-sm text-leaf-800">
                {infoMsg}
              </div>
            )}
            {isRegister && (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                    {t("login.name")}
                  </label>
                  <input type="text" value={name} onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: undefined }); }}
                    required={isRegister}
                    className={`w-full rounded-xl border px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-400/20 ${errors.name ? "border-red-400 bg-red-50" : "border-brand-200 bg-brand-50"}`}
                    placeholder={t("login.name.placeholder")} />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
                </div>

                {/* Selector tipo usuario */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                    {t("login.usertype")}
                  </label>
                  <div className="flex gap-2">
                    {typeOptions.map(({ value, labelKey }) => (
                      <button key={value} type="button" onClick={() => setUserType(value)}
                        className={`flex-1 rounded-xl border-2 py-2.5 text-sm font-medium transition-all ${
                          userType === value
                            ? "border-leaf-500 bg-leaf-50 text-leaf-700 shadow-sm"
                            : "border-brand-200 bg-brand-50 text-brand-400 hover:border-brand-300"
                        }`}>
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                {t("login.email")}
              </label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: undefined }); }}
                required
                className={`w-full rounded-xl border px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-400/20 ${errors.email ? "border-red-400 bg-red-50" : "border-brand-200 bg-brand-50"}`}
                placeholder={t("login.email.placeholder")} autoComplete="email" />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-brand-400">
                {t("login.password")}
              </label>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: undefined }); }}
                required minLength={6}
                className={`w-full rounded-xl border px-4 py-3 text-sm text-brand-900 placeholder:text-brand-300 outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-400/20 ${errors.password ? "border-red-400 bg-red-50" : "border-brand-200 bg-brand-50"}`}
                placeholder={t("login.password.placeholder")} autoComplete={isRegister ? "new-password" : "current-password"} />
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password}</p>}
            </div>

            {!isRegister && (
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="-mt-1 block w-full text-right text-xs font-medium text-leaf-700 hover:text-leaf-800 disabled:opacity-50"
              >
                {t("login.forgot")}
              </button>
            )}

            <button type="submit" disabled={loading}
              className="w-full rounded-2xl bg-leaf-600 py-3.5 text-sm font-semibold text-white hover:bg-leaf-700 active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-leaf-600/20">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {isRegister ? t("login.submitting.register") : t("login.submitting.signin")}
                </span>
              ) : isRegister ? t("login.submit.register") : t("login.submit.signin")}
            </button>
          </form>
        </div>
        <div className="mt-6 text-center">
          <Link href="/" className="text-xs text-brand-400 hover:text-brand-600">{t("login.back")}</Link>
        </div>
      </div>
    </div>
  );
}
