/**
 * Centralized Firebase collection names with type safety
 * Prevents hardcoded strings and enables easy refactoring
 */

export const COLLECTIONS = {
  // Root collections
  ORGS: "orgs",
  USERS: "users",
  CATEGORIES: "categories",
  PRODUCTS: "products",
  ORDERS: "orders",
  TICKETS: "tickets",
  CUSTOMER_PROFILES: "customer_profiles",
  RECIPES: "recipes",
  SKUS: "skus",
  REDEMPTIONS: "redemptions",
  MEETING_COMBOS: "meeting_combos",

  // Comunidad Enverde (global, cross-café — NO org-scoped):
  // foro compartido entre todos los negocios. Topics por tipo de negocio.
  COMMUNITY_POSTS: "community_posts",
  ANSWERS: "answers", // subcolección de community_posts/{postId}
  VOTES: "votes", // subcolección de .../answers/{answerId} — doc id = uid
  COMMUNITY_NOTIFICATIONS: "community_notifications", // subcolección de users/{uid}
  COMMUNITY_REPORTS: "community_reports", // global — moderación (flags de revisión)

  // Nested collections (under orgs/{orgId})
  MEMBERS: "members",
  NOTES: "notes",
  TASKS: "tasks",
  PACKAGING: "packaging",
  SUPPLIERS: "suppliers",
  CATALOG: "catalog",
  SETTINGS: "settings",
  PRODUCTS_ORG: "products",
  INVENTORY_STOCK: "inventory_stock",
  INVENTORY_CATEGORIES: "inventory_categories",
  INVENTORY_MOVEMENTS: "inventory_movements",
  INVENTORY_WASTE: "inventory_waste",
  LOYALTY_TRANSACTIONS: "loyalty_transactions",
  LOYALTY_SNAPSHOTS: "loyalty_snapshots",

  // Nested collections (under orgs/{orgId}/suppliers/{supplierId})
  INVOICES: "invoices",

  // Nested collections (under orgs/{orgId}/recipes/{recipeId})
  INGREDIENTS: "ingredients",

  // Treasury collections (under orgs/{orgId})
  BANK_STATEMENTS: "bank_statements",
  BANK_MOVEMENTS: "bank_movements",
  TREASURY_RULES: "treasury_rules",
  TREASURY_ACCOUNTS: "treasury_accounts",
  TREASURY_ASSUMPTIONS: "treasury_assumptions",
  TREASURY_ACCRUALS: "treasury_accruals",
  TREASURY_MONTHLY_SNAPSHOTS: "treasury_monthly_snapshots",
} as const;

/**
 * Type-safe collection name helper for nested collections
 */
export function getNestedCollectionPath(
  orgId: string,
  collection: (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
): string {
  return `orgs/${orgId}/${collection}`;
}

/**
 * Type-safe collection name helper for deeply nested collections
 */
export function getDeeplyNestedCollectionPath(
  orgId: string,
  parentCollection: (typeof COLLECTIONS)[keyof typeof COLLECTIONS],
  parentId: string,
  childCollection: (typeof COLLECTIONS)[keyof typeof COLLECTIONS]
): string {
  return `orgs/${orgId}/${parentCollection}/${parentId}/${childCollection}`;
}
