"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { signIn as serviceSignIn, type CafeUser, type UserRole } from "@/lib/simple-auth-service"
import { auth } from "@/lib/firebase-auth"
import { onIdTokenChanged, signOut as firebaseSignOut, signInWithCustomToken } from "firebase/auth"

type SimpleAuthContextType = {
  user: CafeUser | null
  loading: boolean
  isLoading: boolean
  firestoreAvailable: boolean
  sessionExpiring: boolean
  signIn: (email: string, pin: string) => Promise<CafeUser>
  signInWithToken: (token: string) => Promise<CafeUser>
  signOut: () => void
  // mantenemos estas props por compatibilidad (aunque ahora no se usen en login)
  users: CafeUser[]
  registerUser: (name: string, pin: string, role: UserRole) => Promise<CafeUser>
  refreshUsers: () => Promise<void>
}

const SimpleAuthContext = createContext<SimpleAuthContextType | undefined>(undefined)

export function SimpleAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CafeUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpiring, setSessionExpiring] = useState(false)

  // Con auth cerrado, Firestore solo "está disponible" cuando estés logueado.
  // Para el login email+pin, no bloqueamos la UI por esto.
  const [firestoreAvailable, setFirestoreAvailable] = useState(true)

  // Ya no usamos dropdown de usuarios
  const [users] = useState<CafeUser[]>([])

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("cafeUser")
      if (savedUser) {
        const parsed = JSON.parse(savedUser)
        setUser(parsed)
      }
    } catch {
      localStorage.removeItem("cafeUser")
    } finally {
      // IMPORTANT: no hacemos llamadas a Firestore aquí
      setLoading(false)
    }
  }, [])

  // Token refresh logic: keep session alive and warn before expiry
  useEffect(() => {
    let tokenRefreshInterval: NodeJS.Timeout
    let expiryWarningTimeout: NodeJS.Timeout

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser && user) {
        // Schedule token refresh every 50 minutes (tokens expire after ~1 hour)
        clearInterval(tokenRefreshInterval)
        clearTimeout(expiryWarningTimeout)

        tokenRefreshInterval = setInterval(async () => {
          try {
            await firebaseUser.getIdToken(true)
            setSessionExpiring(false)
          } catch (error) {
            console.error("Token refresh failed:", error)
            setSessionExpiring(true)
          }
        }, 50 * 60 * 1000)

        // Show warning 5 minutes before expiry
        expiryWarningTimeout = setTimeout(() => {
          setSessionExpiring(true)
        }, 55 * 60 * 1000)
      }
    })

    return () => {
      clearInterval(tokenRefreshInterval)
      clearTimeout(expiryWarningTimeout)
      unsubscribe()
    }
  }, [user])

  const handleSignIn = async (email: string, pin: string) => {
    const loggedInUser = await serviceSignIn(email, pin)
    setUser(loggedInUser)
    localStorage.setItem("cafeUser", JSON.stringify(loggedInUser))
    setFirestoreAvailable(true)
    return loggedInUser
  }

  // Login enverde (bridge custom-token): canjea el token firmado por el brain
  // (uid=enverde_<orgId>) por sesión Firebase y siembra un cafeUser mínimo para
  // pasar la guardia del POS. El orgId real lo resuelve useOrg vía /api/my-orgs
  // (users.orgIds); el acceso a datos sigue gateado por orgs/{id}/members.
  const handleSignInWithToken = async (token: string): Promise<CafeUser> => {
    const cred = await signInWithCustomToken(auth, token)
    await cred.user.getIdToken(true)
    const claims = (await cred.user.getIdTokenResult()).claims
    const orgId = typeof claims.orgId === "string" ? claims.orgId : ""
    const cafeUser: CafeUser = {
      id: cred.user.uid,
      name: orgId || "Mi café",
      pin: "",
      role: "admin",
      createdAt: null,
    }
    setUser(cafeUser)
    try { localStorage.setItem("cafeUser", JSON.stringify(cafeUser)) } catch {}
    setFirestoreAvailable(true)
    return cafeUser
  }

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth)
    } catch (error) {
      console.error("Error signing out from Firebase:", error)
    }
    setUser(null)
    setSessionExpiring(false)
    localStorage.removeItem("cafeUser")
  }

  // placeholders por compatibilidad (si algún sitio los llama)
  const registerUser = async () => {
    throw new Error("Registro desactivado: usa scripts de terminal para crear staff y upsert en cafe_users.")
  }
  const refreshUsers = async () => {}

  return (
    <SimpleAuthContext.Provider
      value={{
        user,
        users,
        loading,
        isLoading: loading,
        firestoreAvailable,
        sessionExpiring,
        signIn: handleSignIn,
        signInWithToken: handleSignInWithToken,
        signOut: handleSignOut,
        registerUser,
        refreshUsers,
      }}
    >
      {children}
      {/* Session expiring warning banner */}
      {sessionExpiring && user && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-red-500 text-white p-4 flex items-center justify-center gap-4 font-semibold shadow-lg">
          <span>Tu sesión está a punto de expirar.</span>
          <button
            onClick={async () => {
              try {
                const currentUser = auth.currentUser
                if (currentUser) {
                  await currentUser.getIdToken(true)
                  setSessionExpiring(false)
                }
              } catch {
                handleSignOut()
              }
            }}
            className="bg-white text-red-600 px-4 py-1.5 rounded-lg text-sm font-bold hover:bg-red-50 transition-colors"
          >
            Renovar sesión
          </button>
        </div>
      )}
    </SimpleAuthContext.Provider>
  )
}

export function useSimpleAuth() {
  const ctx = useContext(SimpleAuthContext)
  if (!ctx) throw new Error("useSimpleAuth debe usarse dentro de SimpleAuthProvider")
  return ctx
}
