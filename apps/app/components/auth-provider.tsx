"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User, onIdTokenChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Monitor token expiration
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Try to refresh the token - if this fails, session has expired
          await firebaseUser.getIdToken(true);
        } catch (error) {
          // Session expired, log out and redirect
          console.warn("[Auth] Session expired:", error);
          toast.error("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
          await auth.signOut();
          router.push("/login");
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
