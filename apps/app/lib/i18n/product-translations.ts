/**
 * Product translation strategy:
 * 1. If product has `name_en` field in Firestore → use it (highest priority)
 * 2. If exact match in dictionary → use translation
 * 3. Otherwise → keep original Spanish name (NO partial matching)
 */

const PRODUCT_MAP: Record<string, string> = {
  "café solo": "Espresso",
  "café con leche": "Latte",
  "cortado": "Cortado",
  "café americano": "Americano",
  "americano": "Americano",
  "capuchino": "Cappuccino",
  "cappuccino": "Cappuccino",
  "café con hielo": "Iced coffee",
  "café helado": "Iced coffee",
  "espresso": "Espresso",
  "espresso doble": "Double espresso",
  "doble espresso": "Double espresso",
  "café descafeinado": "Decaf coffee",
  "descafeinado": "Decaf",
  "café bombón": "Condensed milk coffee",
  "café latte": "Caffè latte",
  "latte": "Latte",
  "flat white": "Flat white",
  "mocha": "Mocha",
  "café mocha": "Caffè mocha",
  "macchiato": "Macchiato",
  "latte macchiato": "Latte macchiato",
  "affogato": "Affogato",
  "ristretto": "Ristretto",
  "lungo": "Lungo",
  "café con nata": "Coffee with cream",
  "carajillo": "Carajillo",
  "café con leche de avena": "Oat milk latte",
  "café con leche de soja": "Soy milk latte",
  "café con leche de almendras": "Almond milk latte",
  "té verde": "Green tea",
  "té negro": "Black tea",
  "té rojo": "Red tea",
  "matcha": "Matcha",
  "matcha latte": "Matcha latte",
  "chai": "Chai",
  "chai latte": "Chai latte",
  "manzanilla": "Chamomile tea",
  "menta": "Mint tea",
  "rooibos": "Rooibos",
  "zumo de naranja": "Orange juice",
  "zumo natural": "Fresh juice",
  "limonada": "Lemonade",
  "agua": "Water",
  "agua mineral": "Mineral water",
  "agua con gas": "Sparkling water",
  "chocolate caliente": "Hot chocolate",
  "chocolate": "Chocolate",
  "croissant": "Croissant",
  "napolitana": "Chocolate croissant",
  "napolitana de chocolate": "Chocolate croissant",
  "palmera": "Palmier",
  "magdalena": "Muffin",
  "muffin": "Muffin",
  "galleta": "Cookie",
  "brownie": "Brownie",
  "tarta de queso": "Cheesecake",
  "tarta de zanahoria": "Carrot cake",
  "tarta de chocolate": "Chocolate cake",
  "bizcocho": "Sponge cake",
  "cookie": "Cookie",
  "carrot cake": "Carrot cake",
  "cheesecake": "Cheesecake",
  "banana bread": "Banana bread",
  "tostada": "Toast",
  "tostada con tomate": "Toast with tomato",
  "tostada con aceite": "Toast with olive oil",
  "tostada con mantequilla": "Toast with butter",
  "tostada con jamón": "Toast with ham",
  "tostada con aguacate": "Avocado toast",
  "bocadillo": "Sandwich",
  "bocadillo de jamón": "Ham sandwich",
  "bocadillo de tortilla": "Omelette sandwich",
  "sandwich": "Sandwich",
  "sandwich mixto": "Ham & cheese sandwich",
  "panini": "Panini",
  "bagel": "Bagel",
  "ensalada": "Salad",
  "tortilla española": "Spanish omelette",
  "yogur": "Yogurt",
  "yogur con granola": "Yogurt with granola",
  "granola": "Granola",
  "porridge": "Porridge",
}

const CATEGORY_MAP: Record<string, string> = {
  "café": "Coffee", "cafés": "Coffee", "cafes": "Coffee",
  "té": "Tea", "tés": "Teas", "infusiones": "Herbal teas",
  "bebidas": "Drinks", "bebidas frías": "Cold drinks", "bebidas calientes": "Hot drinks",
  "bollería": "Pastry", "bolleria": "Pastry", "dulces": "Sweets",
  "tostadas": "Toast", "bocadillos": "Sandwiches",
  "comida": "Food", "desayunos": "Breakfast", "snacks": "Snacks",
  "zumos": "Juices", "batidos": "Smoothies",
  "especiales": "Specials", "extras": "Extras", "otros": "Other",
  "promociones": "Deals", "ofertas": "Offers",
}

/**
 * Translate a product name. ONLY exact matches — no partial matching.
 * @param name - Original product name from Firestore
 * @param locale - Target locale
 * @param nameEn - Optional name_en field from Firestore (highest priority)
 */
export function translateProduct(name: string, locale: "es" | "en", nameEn?: string): string {
  if (locale === "es") return name

  // Priority 1: Use name_en from Firestore if available
  if (nameEn && nameEn.trim()) return nameEn

  // Priority 2: Exact match in dictionary only
  const lower = name.toLowerCase().trim()
  if (PRODUCT_MAP[lower]) return PRODUCT_MAP[lower]

  // Try without accents (exact match only)
  const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  if (PRODUCT_MAP[normalized]) return PRODUCT_MAP[normalized]

  // No match → keep original name (e.g. "Promoción café + bizcocho" stays as-is)
  return name
}

export function translateCategory(name: string, locale: "es" | "en"): string {
  if (locale === "es") return name
  const lower = name.toLowerCase().trim()
  return CATEGORY_MAP[lower] || CATEGORY_MAP[lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "")] || name
}
