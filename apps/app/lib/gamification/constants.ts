/**
 * gamification/constants.ts
 *
 * Constantes del sistema de gamificación.
 * Naming cafetero, niveles, badges, misiones base.
 *
 * MEJORA DETECTADA: Los "puntos" genéricos no crean identidad de marca.
 * CAMBIO: Renombramos a "Granos" — coherente con café, memorable, único.
 * IMPACTO: Diferenciación de marca, el usuario habla de "mis granos" no "mis puntos".
 */

import type { Level, Badge, Mission } from "./types"

// ═══════════════════════════════════════════════════════════════
// MONEDA
// ═══════════════════════════════════════════════════════════════

/** Nombre de la moneda en español */
export const CURRENCY_NAME = "Granos"
/** Nombre de la moneda en inglés */
export const CURRENCY_NAME_EN = "Beans"
/** Emoji de la moneda */
export const CURRENCY_EMOJI = "☕"
/** Tasa de conversión: 1€ = 100 granos */
export const GRANOS_PER_EURO = 100
/** Café base = 2,50€ = 250 granos */
export const GRANOS_PER_COFFEE = 250

// ═══════════════════════════════════════════════════════════════
// NIVELES
// Progresión natural: del grano crudo al barista experto.
// Los umbrales están calibrados para que:
// - Semilla→Brote: ~4 compras (accesible rápido, hook)
// - Brote→Raíz: ~12 compras más (1-2 meses activo)
// - Raíz→Cosecha: ~30 compras más (3-4 meses, habitual)
// - Cosecha→Barista: ~60 compras más (6+ meses, fan)
// ═══════════════════════════════════════════════════════════════

export const LEVELS: Level[] = [
  {
    id: "semilla",
    name: "Semilla",
    nameEn: "Seed",
    emoji: "🌱",
    threshold: 0,
    color: "brand",
    tagline: "Tu viaje cafetero empieza aquí",
    taglineEn: "Your coffee journey starts here",
  },
  {
    id: "brote",
    name: "Brote",
    nameEn: "Sprout",
    emoji: "🌿",
    threshold: 2000,
    color: "leaf",
    tagline: "Ya sabes lo que te gusta",
    taglineEn: "You know what you like",
  },
  {
    id: "raiz",
    name: "Raíz",
    nameEn: "Root",
    emoji: "🌳",
    threshold: 8000,
    color: "leaf",
    tagline: "Parte de la comunidad cafetera",
    taglineEn: "Part of the coffee community",
  },
  {
    id: "cosecha",
    name: "Cosecha",
    nameEn: "Harvest",
    emoji: "☀️",
    threshold: 24000,
    color: "cream",
    tagline: "Conoces el café como pocos",
    taglineEn: "You know coffee like few do",
  },
  {
    id: "barista",
    name: "Barista",
    nameEn: "Barista",
    emoji: "👑",
    threshold: 60000,
    color: "brand",
    tagline: "Maestro del café de especialidad",
    taglineEn: "Specialty coffee master",
  },
]

// ═══════════════════════════════════════════════════════════════
// BADGES
// Categorías: exploración, recurrencia, conocimiento,
//             sostenibilidad, comunidad, velocidad
// ═══════════════════════════════════════════════════════════════

export const BADGES: Badge[] = [
  // ── Exploración ──
  {
    id: "first-sip",
    name: "Primer sorbo",
    nameEn: "First sip",
    description: "Haz tu primera compra en Raíz y Grano",
    descriptionEn: "Make your first purchase at Raíz y Grano",
    emoji: "☕",
    category: "exploration",
    rarity: "common",
    unlockCriteria: "1 compra realizada",
    unlockCriteriaEn: "1 purchase made",
    celebration: "¡Bienvenido a la familia! Tu primer café con nosotros.",
    celebrationEn: "Welcome to the family! Your first coffee with us.",
    bonusReward: 100,
  },
  {
    id: "flavor-explorer",
    name: "Explorador de sabores",
    nameEn: "Flavor explorer",
    description: "Prueba 5 productos diferentes",
    descriptionEn: "Try 5 different products",
    emoji: "🗺️",
    category: "exploration",
    rarity: "rare",
    unlockCriteria: "5 productos distintos comprados",
    unlockCriteriaEn: "5 different products purchased",
    celebration: "Tu paladar se está expandiendo. Cada taza es un viaje.",
    celebrationEn: "Your palate is expanding. Every cup is a journey.",
    bonusReward: 300,
  },
  {
    id: "menu-master",
    name: "Maestro de carta",
    nameEn: "Menu master",
    description: "Prueba 10 productos diferentes",
    descriptionEn: "Try 10 different products",
    emoji: "📖",
    category: "exploration",
    rarity: "epic",
    unlockCriteria: "10 productos distintos comprados",
    unlockCriteriaEn: "10 different products purchased",
    celebration: "Conoces nuestra carta mejor que muchos. Respect.",
    celebrationEn: "You know our menu better than most. Respect.",
    bonusReward: 600,
  },

  // ── Recurrencia ──
  {
    id: "weekly-ritual",
    name: "Ritual semanal",
    nameEn: "Weekly ritual",
    description: "Compra al menos una vez por semana durante 4 semanas",
    descriptionEn: "Buy at least once a week for 4 weeks",
    emoji: "🔄",
    category: "recurrence",
    rarity: "rare",
    unlockCriteria: "4 semanas consecutivas con compra",
    unlockCriteriaEn: "4 consecutive weeks with a purchase",
    celebration: "El café contigo ya es un ritual. Nos encanta.",
    celebrationEn: "Coffee with you is now a ritual. We love it.",
    bonusReward: 400,
  },
  {
    id: "loyal-regular",
    name: "De la casa",
    nameEn: "Regular",
    description: "Acumula 25 compras en total",
    descriptionEn: "Accumulate 25 total purchases",
    emoji: "🏠",
    category: "recurrence",
    rarity: "epic",
    unlockCriteria: "25 compras totales",
    unlockCriteriaEn: "25 total purchases",
    celebration: "Eres de la casa. Literalmente.",
    celebrationEn: "You're a regular. Literally.",
    bonusReward: 1000,
  },

  // ── Conocimiento ──
  {
    id: "curious-mind",
    name: "Mente curiosa",
    nameEn: "Curious mind",
    description: "Completa tu primer quiz",
    descriptionEn: "Complete your first quiz",
    emoji: "🧠",
    category: "knowledge",
    rarity: "common",
    unlockCriteria: "1 quiz completado",
    unlockCriteriaEn: "1 quiz completed",
    celebration: "La curiosidad es el primer paso. Sigue aprendiendo.",
    celebrationEn: "Curiosity is the first step. Keep learning.",
    bonusReward: 100,
  },
  {
    id: "coffee-scholar",
    name: "Cafetólogo",
    nameEn: "Coffee scholar",
    description: "Completa todos los quizzes de bienvenida",
    descriptionEn: "Complete all welcome quizzes",
    emoji: "🎓",
    category: "knowledge",
    rarity: "rare",
    unlockCriteria: "Todos los quizzes de bienvenida completados",
    unlockCriteriaEn: "All welcome quizzes completed",
    celebration: "Tienes las bases. Ahora viene lo bueno.",
    celebrationEn: "You've got the basics. Now comes the good stuff.",
    bonusReward: 400,
  },
  {
    id: "coffee-expert",
    name: "Experto cafetero",
    nameEn: "Coffee expert",
    description: "Completa 8 quizzes diferentes",
    descriptionEn: "Complete 8 different quizzes",
    emoji: "🏆",
    category: "knowledge",
    rarity: "epic",
    unlockCriteria: "8 quizzes completados",
    unlockCriteriaEn: "8 quizzes completed",
    celebration: "Sabes más de café que la mayoría. Impresionante.",
    celebrationEn: "You know more about coffee than most. Impressive.",
    bonusReward: 800,
  },

  // ── Sostenibilidad ──
  {
    id: "green-choice",
    name: "Elección verde",
    nameEn: "Green choice",
    description: "Usa un vaso reutilizable o canjea uno",
    descriptionEn: "Use or redeem a reusable cup",
    emoji: "♻️",
    category: "sustainability",
    rarity: "rare",
    unlockCriteria: "1 uso/canje de vaso reutilizable",
    unlockCriteriaEn: "1 reusable cup use/redemption",
    celebration: "Pequeños gestos, gran impacto. Gracias.",
    celebrationEn: "Small gestures, big impact. Thank you.",
    bonusReward: 300,
  },

  // ── Comunidad ──
  {
    id: "first-redeem",
    name: "Primer canje",
    nameEn: "First redeem",
    description: "Canjea tu primera recompensa",
    descriptionEn: "Redeem your first reward",
    emoji: "🎁",
    category: "community",
    rarity: "common",
    unlockCriteria: "1 recompensa canjeada",
    unlockCriteriaEn: "1 reward redeemed",
    celebration: "¡Tu primer canje! Esto es solo el principio.",
    celebrationEn: "Your first redemption! This is just the beginning.",
    bonusReward: 100,
  },

  // ── Velocidad ──
  {
    id: "order-ahead-pro",
    name: "Pedido listo",
    nameEn: "Order ahead pro",
    description: "Haz 3 pedidos por la app antes de llegar",
    descriptionEn: "Place 3 orders through the app before arriving",
    emoji: "⚡",
    category: "speed",
    rarity: "rare",
    unlockCriteria: "3 pedidos por app",
    unlockCriteriaEn: "3 app orders placed",
    celebration: "Sin colas, sin esperas. Así se pide.",
    celebrationEn: "No queues, no waiting. That's how it's done.",
    bonusReward: 300,
  },
]

// ═══════════════════════════════════════════════════════════════
// MISIONES
// ═══════════════════════════════════════════════════════════════

export const MISSIONS: Mission[] = [
  // ── Onboarding ──
  {
    id: "m-welcome",
    title: "Bienvenida cafetera",
    titleEn: "Coffee welcome",
    description: "Completa un quiz de bienvenida para conocer el programa",
    descriptionEn: "Complete a welcome quiz to learn about the program",
    emoji: "👋",
    category: "onboarding",
    reward: 200,
    badgeId: "curious-mind",
    criteria: [{ type: "quiz_complete", target: 1 }],
    priority: 1,
  },
  {
    id: "m-first-purchase",
    title: "Tu primer café",
    titleEn: "Your first coffee",
    description: "Haz tu primera compra — en barra o por la app",
    descriptionEn: "Make your first purchase — at the bar or through the app",
    emoji: "☕",
    category: "onboarding",
    reward: 200,
    badgeId: "first-sip",
    criteria: [{ type: "first_purchase", target: 1 }],
    priority: 2,
  },
  {
    id: "m-complete-profile",
    title: "Tu perfil cafetero",
    titleEn: "Your coffee profile",
    description: "Completa los quizzes de bienvenida para personalizar tu experiencia",
    descriptionEn: "Complete welcome quizzes to personalize your experience",
    emoji: "🎯",
    category: "onboarding",
    reward: 400,
    badgeId: "coffee-scholar",
    criteria: [{ type: "quiz_complete", target: 2 }],
    requiresMissionId: "m-welcome",
    priority: 3,
  },

  // ── Semanales ──
  {
    id: "m-weekly-quiz",
    title: "Reto de la semana",
    titleEn: "Weekly challenge",
    description: "Completa el quiz semanal para ganar granos extra",
    descriptionEn: "Complete the weekly quiz to earn extra beans",
    emoji: "🧠",
    category: "weekly",
    reward: 100,
    criteria: [{ type: "quiz_complete", target: 1 }],
    expiresInDays: 7,
    priority: 10,
  },
  {
    id: "m-weekly-visit",
    title: "Visita semanal",
    titleEn: "Weekly visit",
    description: "Haz al menos una compra esta semana",
    descriptionEn: "Make at least one purchase this week",
    emoji: "📅",
    category: "weekly",
    reward: 100,
    criteria: [{ type: "purchase_count", target: 1 }],
    expiresInDays: 7,
    priority: 11,
  },

  // ── Descubrimiento ──
  {
    id: "m-try-3",
    title: "Prueba algo nuevo",
    titleEn: "Try something new",
    description: "Pide 3 productos diferentes que no hayas probado antes",
    descriptionEn: "Order 3 different products you haven't tried before",
    emoji: "🗺️",
    category: "discovery",
    reward: 400,
    badgeId: "flavor-explorer",
    criteria: [{ type: "unique_products", target: 5 }],
    priority: 20,
  },

  // ── Recurrencia ──
  {
    id: "m-streak-4",
    title: "Racha cafetera",
    titleEn: "Coffee streak",
    description: "Visítanos al menos una vez por semana durante 4 semanas seguidas",
    descriptionEn: "Visit us at least once a week for 4 consecutive weeks",
    emoji: "🔥",
    category: "recurrence",
    reward: 600,
    badgeId: "weekly-ritual",
    criteria: [{ type: "streak_days", target: 4 }],
    priority: 30,
  },

  // ── Operativas ──
  {
    id: "m-order-ahead",
    title: "Pide desde la app",
    titleEn: "Order from the app",
    description: "Haz un pedido por la app y recógelo sin esperar",
    descriptionEn: "Place an app order and pick it up without waiting",
    emoji: "⚡",
    category: "operational",
    reward: 200,
    criteria: [{ type: "order_ahead", target: 1 }],
    priority: 15,
  },
]

// ═══════════════════════════════════════════════════════════════
// LÍMITES ANTIFRAUDE
// ═══════════════════════════════════════════════════════════════

/** Máximo de granos por semana solo de quizzes */
export const MAX_WEEKLY_QUIZ_GRANOS = 600
/** Máximo de granos diarios no asociados a compra */
export const MAX_DAILY_NON_PURCHASE_GRANOS = 240
/** Los reintentos de quiz no dan puntos */
export const QUIZ_POINTS_FIRST_ATTEMPT_ONLY = true

// ═══════════════════════════════════════════════════════════════
// STREAK CONFIG
// ═══════════════════════════════════════════════════════════════

/** Bonus granos por semana de racha (semanal, no diaria — menos estrés) */
export const STREAK_WEEKLY_BONUS = 100
/** Techo de bonus por racha (máx 300 pts = 3 semanas de bonus) */
export const STREAK_BONUS_CAP = 300
