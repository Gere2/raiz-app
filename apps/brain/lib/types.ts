// Shared type definitions for the Brain application

export type Product = {
  id: string;
  name: string;
  price: number;
  categoryId: string | null;
  categoryName: string;
  origin?: string | null;
};

export type Category = {
  id: string;
  name: string;
};

export type InvItem = {
  id: string;
  name: string;
  stock: number;
  unit: string;
  minStock: number;
  supplier: string;
  categoryName: string;
};

export type CatalogItem = {
  id: string;
  name: string;
  baseUnit: string;
  packQty: number;
  packUnit: string;
  packCost: number;
  unitCost: number;
  supplier: string;
};

export type Ingredient = {
  id: string;
  catalogItemId: string;
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  lineCost: number;
};

export type Recipe = {
  id: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  sellingPrice: number;
  totalCost: number;
  foodCostPct: number;
  productId?: string;
  productName?: string;
  ingredients?: Ingredient[];
};

export type Sku = {
  id: string;
  name: string;
  category: string;
  station: string;
  standardTimeSec: number;
  version: number;
  status: string;
  posProductId?: string;
  sellingPrice: number;
  recipeId?: string;
  packagingId?: string;
  recipeCost: number;
  packagingCost: number;
  totalCost: number;
  margin: number;
  foodCostPct: number;
  allergens: string[];
  qcChecks: string[];
  substitutions: Array<{ from: string; to: string; costDelta: number; note: string }>;
};

export type Packaging = {
  id: string;
  name: string;
  items: Array<{ name: string; unitCost: number; qty: number }>;
  totalCost: number;
  version: number;
};

export type Supplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  notes: string;
  invoiceCount: number;
};

export type DashboardData = {
  kpis: {
    totalRevenue: number;
    totalTransactions: number;
    avgTicket: number;
    avgFoodCostPct: number;
    estimatedProfit: number;
    costCoverage: number;
    days: number;
  };
  profitability: Array<{
    productId: string;
    productName: string;
    unitsSold: number;
    revenue: number;
    unitCost: number;
    unitMargin: number;
    foodCostPct: number;
    totalProfit: number;
    hasCostData: boolean;
  }>;
  alerts: Array<{
    type: string;
    message: string;
    productId?: string;
  }>;
};
