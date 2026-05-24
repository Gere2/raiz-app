import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth"
import { auth } from "./firebase"

// Tipos
export type UserRole = "admin" | "employee"

export type UserData = {
  uid: string
  email: string
  displayName?: string
  role: UserRole
}

// Registro de usuario
export const registerUser = async (email: string, password: string): Promise<User> => {
  if (!auth) throw new Error("Firebase Auth no está inicializado")

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    return userCredential.user
  } catch (error: any) {
    console.error("Error en registerUser:", error)

    // Mejorar el mensaje de error
    if (error.code === "auth/operation-not-allowed") {
      throw new Error(
        "El registro con correo electrónico y contraseña no está habilitado en Firebase. Por favor, contacta al administrador.",
      )
    }

    throw error
  }
}

// Inicio de sesión
export const signIn = async (email: string, password: string): Promise<User> => {
  if (!auth) throw new Error("Firebase Auth no está inicializado")

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return userCredential.user
  } catch (error: any) {
    console.error("Error en signIn:", error)
    throw error
  }
}

// Cierre de sesión
export const signOut = async (): Promise<void> => {
  if (!auth) throw new Error("Firebase Auth no está inicializado")

  try {
    await firebaseSignOut(auth)
  } catch (error: any) {
    console.error("Error en signOut:", error)
    throw error
  }
}

// Obtener usuario actual
export const getCurrentUser = (): User | null => {
  if (!auth) return null
  return auth.currentUser
}

// Escuchar cambios en el estado de autenticación
export const onAuthStateChange = (callback: (user: User | null) => void): (() => void) => {
  if (!auth) return () => {}

  return onAuthStateChanged(auth, callback)
}
