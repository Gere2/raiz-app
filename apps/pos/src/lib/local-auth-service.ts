import type { CafeUser, UserRole } from "./simple-auth-service"

// Clave para almacenar usuarios en localStorage
const LOCAL_USERS_KEY = "cafe_local_users"

// Obtener todos los usuarios del localStorage
export const getLocalUsers = (): CafeUser[] => {
  if (typeof window === "undefined") return []

  try {
    const usersJson = localStorage.getItem(LOCAL_USERS_KEY)
    if (!usersJson) return []
    return JSON.parse(usersJson)
  } catch (error) {
    console.error("Error al obtener usuarios locales:", error)
    return []
  }
}

// Guardar usuarios en localStorage
export const saveLocalUsers = (users: CafeUser[]): void => {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users))
  } catch (error) {
    console.error("Error al guardar usuarios locales:", error)
  }
}

// Obtener usuario por nombre
export const getLocalUserByName = (name: string): CafeUser | null => {
  const users = getLocalUsers()
  return users.find((user) => user.name === name) || null
}

// Registrar usuario localmente
export const registerLocalUser = (name: string, pin: string, role: UserRole): CafeUser => {
  // Verificar si el usuario ya existe
  const existingUser = getLocalUserByName(name)
  if (existingUser) {
    throw new Error("Este nombre de usuario ya está en uso")
  }

  // Crear nuevo usuario
  const newUser: CafeUser = {
    id: Date.now().toString(), // Usar timestamp como ID
    name,
    pin,
    role,
    createdAt: new Date().toISOString(),
  }

  // Añadir a la lista de usuarios
  const users = getLocalUsers()
  users.push(newUser)
  saveLocalUsers(users)

  return newUser
}

// Iniciar sesión localmente
export const signInLocal = (name: string, pin: string): CafeUser => {
  const user = getLocalUserByName(name)

  if (!user) {
    throw new Error("Usuario no encontrado")
  }

  if (user.pin !== pin) {
    throw new Error("PIN incorrecto")
  }

  return user
}
