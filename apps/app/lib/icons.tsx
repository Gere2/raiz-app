/**
 * icons.tsx — Centralized icon mappings for the app.
 *
 * Replaces ALL emoji usage with Lucide React vector icons.
 * Premium craft style: consistent stroke width, warm feel.
 *
 * Usage:
 *   import { CategoryIcon, MilkIcon, StatusIcon } from "@/lib/icons"
 *   <CategoryIcon name="café" className="h-5 w-5" />
 */

import {
  Coffee, CupSoda, Citrus, Sandwich, UtensilsCrossed, Wheat,
  CakeSlice, Croissant, Cookie, IceCreamCone,
  Snowflake, Star, Tag, Sparkles, Leaf, Egg,
  ShoppingBag, CreditCard, MapPin, Clock, Bell,
  Check, CheckCircle, XCircle, AlertCircle,
  RefreshCw, FileText, Copy, Smartphone,
  Trophy, Gift, BookOpen, Target, Flame, Lock,
  Award, Heart, TrendingUp, Zap, ChevronRight,
  User, LogOut, Globe, ArrowLeft, Plus, Minus,
  X, ChevronDown, Search, QrCode, ClipboardList,
  type LucideProps,
} from "lucide-react"

// ── Category Icons ──────────────────────────────────────────

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  café: Coffee,
  cafes: Coffee,
  coffee: Coffee,
  té: CupSoda,
  te: CupSoda,
  teas: CupSoda,
  infusiones: CupSoda,
  bebidas: CupSoda,
  drinks: CupSoda,
  frias: Snowflake,
  frías: Snowflake,
  batidos: IceCreamCone,
  smoothies: IceCreamCone,
  bollería: Croissant,
  bolleria: Croissant,
  pastry: Croissant,
  dulces: CakeSlice,
  pasteles: CakeSlice,
  tostadas: Sandwich,
  toast: Sandwich,
  sandwiches: Sandwich,
  bocadillos: Sandwich,
  snacks: Cookie,
  otros: Sparkles,
  other: Sparkles,
  zumos: Citrus,
  juice: Citrus,
  comida: UtensilsCrossed,
  food: UtensilsCrossed,
  desayunos: Egg,
  breakfast: Egg,
  especiales: Star,
  specials: Star,
  promociones: Tag,
  ofertas: Tag,
}

export function CategoryIcon({
  name,
  className = "h-5 w-5",
  ...props
}: { name: string } & Omit<LucideProps, "ref">) {
  const lower = name.toLowerCase().trim()
  for (const [key, Icon] of Object.entries(CATEGORY_ICON_MAP)) {
    if (lower.includes(key)) return <Icon className={className} {...props} />
  }
  return <Coffee className={className} {...props} />
}

export function getCategoryIconComponent(name: string): React.ComponentType<LucideProps> {
  const lower = name.toLowerCase().trim()
  for (const [key, Icon] of Object.entries(CATEGORY_ICON_MAP)) {
    if (lower.includes(key)) return Icon
  }
  return Coffee
}

// ── Product fallback icon (when no image) ───────────────────

export function ProductFallbackIcon({
  productName,
  category,
  className = "h-8 w-8",
}: {
  productName: string
  category?: string
  className?: string
}) {
  const name = productName.toLowerCase()
  const cat = (category || "").toLowerCase()

  // Try category first
  for (const [key, Icon] of Object.entries(CATEGORY_ICON_MAP)) {
    if (cat.includes(key)) return <Icon className={className} />
  }

  // Fallback by product name
  if (name.includes("café") || name.includes("coffee") || name.includes("latte") || name.includes("espresso"))
    return <Coffee className={className} />
  if (name.includes("té") || name.includes("tea") || name.includes("chai"))
    return <CupSoda className={className} />
  if (name.includes("tostada") || name.includes("toast"))
    return <Sandwich className={className} />
  if (name.includes("croissant"))
    return <Croissant className={className} />

  return <Coffee className={className} />
}

// ── Milk Icons ──────────────────────────────────────────────

const MILK_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  normal: CupSoda,
  "sin-lactosa": CupSoda,
  almendras: Leaf,
  avena: Wheat,
}

export function MilkIcon({
  milk,
  className = "h-5 w-5",
}: {
  milk: string
  className?: string
}) {
  const Icon = MILK_ICON_MAP[milk] || CupSoda
  return <Icon className={className} />
}

// ── Order Status Icons ──────────────────────────────────────

const STATUS_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  CREATED: ClipboardList,
  IN_QUEUE: Clock,
  PREPARING: Coffee,
  READY: Bell,
  PICKED_UP: CheckCircle,
  CANCELED: XCircle,
}

export function StatusIcon({
  status,
  className = "h-5 w-5",
}: {
  status: string
  className?: string
}) {
  const Icon = STATUS_ICON_MAP[status] || Clock
  return <Icon className={className} />
}

// ── Badge Category Icons ────────────────────────────────────

const BADGE_CATEGORY_MAP: Record<string, React.ComponentType<LucideProps>> = {
  exploration: Target,
  recurrence: RefreshCw,
  knowledge: BookOpen,
  sustainability: Leaf,
  community: Heart,
  speed: Zap,
}

export function BadgeCategoryIcon({
  category,
  className = "h-5 w-5",
}: {
  category: string
  className?: string
}) {
  const Icon = BADGE_CATEGORY_MAP[category] || Award
  return <Icon className={className} />
}

// ── Transaction Type Icons ──────────────────────────────────

const TX_ICON_MAP: Record<string, React.ComponentType<LucideProps>> = {
  APP: Smartphone,
  POS: CreditCard,
  QUIZ: BookOpen,
  MISSION: Target,
  BADGE: Award,
  STREAK: Flame,
  PURCHASE: ShoppingBag,
  REDEEM: Gift,
}

export function TxTypeIcon({
  type,
  className = "h-4 w-4",
}: {
  type: string
  className?: string
}) {
  const Icon = TX_ICON_MAP[type] || Coffee
  return <Icon className={className} />
}

// ── Re-exports for convenience ──────────────────────────────

export {
  Coffee, CupSoda, Citrus, Sandwich, UtensilsCrossed, Wheat,
  CakeSlice, Croissant, Cookie, IceCreamCone,
  Snowflake, Star, Tag, Sparkles, Leaf, Egg,
  ShoppingBag, CreditCard, MapPin, Clock, Bell,
  Check, CheckCircle, XCircle, AlertCircle,
  RefreshCw, FileText, Copy, Smartphone,
  Trophy, Gift, BookOpen, Target, Flame, Lock,
  Award, Heart, TrendingUp, Zap, ChevronRight,
  User, LogOut, Globe, ArrowLeft, Plus, Minus,
  X, ChevronDown, Search, QrCode, ClipboardList,
}
