// Sistema de caché para reducir consultas a Firestore
type CacheItem<T> = {
  data: T
  timestamp: number
  expiry: number // Tiempo de expiración en milisegundos
}

class CacheService {
  private cache: Map<string, CacheItem<any>> = new Map()
  private readonly DEFAULT_EXPIRY = 5 * 60 * 1000 // 5 minutos por defecto

  // Obtener un elemento de la caché
  get<T>(key: string): T | null {
    const item = this.cache.get(key)

    if (!item) return null

    // Verificar si el elemento ha expirado
    if (Date.now() > item.timestamp + item.expiry) {
      this.cache.delete(key)
      return null
    }

    return item.data as T
  }

  // Guardar un elemento en la caché
  set<T>(key: string, data: T, expiry: number = this.DEFAULT_EXPIRY): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiry,
    })
  }

  // Eliminar un elemento de la caché
  delete(key: string): void {
    this.cache.delete(key)
  }

  // Eliminar elementos que coincidan con un patrón
  deletePattern(pattern: string): void {
    const regex = new RegExp(pattern)
    for (const key of Array.from(this.cache.keys())) {
      if (regex.test(key)) {
        this.cache.delete(key)
      }
    }
  }

  // Limpiar toda la caché
  clear(): void {
    this.cache.clear()
  }

  // Verificar si un elemento existe en la caché y no ha expirado
  has(key: string): boolean {
    const item = this.cache.get(key)
    if (!item) return false

    if (Date.now() > item.timestamp + item.expiry) {
      this.cache.delete(key)
      return false
    }

    return true
  }
}

// Exportar una instancia única del servicio de caché
export const cacheService = new CacheService()
