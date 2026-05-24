import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; recipeId: string }> };

/**
 * Recalcula totalCost y foodCostPct de una receta
 */
async function recalcRecipe(orgId: string, recipeId: string) {
  const recipeRef = db.collection("orgs").doc(orgId).collection("recipes").doc(recipeId);

  const [recipeSnap, ingSnap] = await Promise.all([
    recipeRef.get(),
    recipeRef.collection("ingredients").get(),
  ]);

  const totalCost = ingSnap.docs.reduce(
    (sum, d) => sum + (Number(d.data().lineCost) || 0),
    0
  );

  const sellingPrice = Number(recipeSnap.data()?.sellingPrice) || 0;
  const foodCostPct = sellingPrice > 0 ? (totalCost / sellingPrice) * 100 : 0;

  await recipeRef.update({
    totalCost,
    foodCostPct,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { totalCost, foodCostPct };
}

/**
 * GET /api/org/[orgId]/recipes/[recipeId]/ingredients
 * Lista ingredientes de una receta
 */
export async function GET(req: Request, { params }: Params) {
  try {
    const { orgId, recipeId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db
      .collection("orgs").doc(orgId)
      .collection("recipes").doc(recipeId)
      .collection("ingredients")
      .orderBy("name")
      .get();

    const ingredients = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ingredients });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

/**
 * POST /api/org/[orgId]/recipes/[recipeId]/ingredients
 * Añade un ingrediente desde el catálogo
 *
 * Body: { catalogItemId, qty, unit? }
 *   - Busca el item en catalog para obtener unitCost y nombre
 *   - Calcula lineCost = qty × unitCost (con conversión si las unidades difieren)
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId, recipeId } = await params;
    const body = await req.json();

    const { catalogItemId, qty, unit } = body;

    if (!catalogItemId || !qty) {
      return NextResponse.json(
        { error: "catalogItemId y qty son obligatorios" },
        { status: 400 }
      );
    }

    // Buscar item del catálogo
    const catSnap = await db
      .collection("orgs").doc(orgId)
      .collection("catalog").doc(catalogItemId)
      .get();

    if (!catSnap.exists) {
      return NextResponse.json(
        { error: "Artículo de catálogo no encontrado" },
        { status: 404 }
      );
    }

    const catData = catSnap.data()!;
    const effectiveUnit = unit || catData.baseUnit;

    // Conversión de unidades simples (g↔kg, ml↔L)
    let effectiveQtyInBase = Number(qty);
    if (effectiveUnit !== catData.baseUnit) {
      const converted = convertToBase(Number(qty), effectiveUnit, catData.baseUnit);
      if (converted === null) {
        return NextResponse.json(
          { error: `Conversión no soportada: ${effectiveUnit} → ${catData.baseUnit}` },
          { status: 400 }
        );
      }
      effectiveQtyInBase = converted;
    }

    const unitCost = Number(catData.unitCost) || 0;
    const lineCost = effectiveQtyInBase * unitCost;

    const ingRef = db
      .collection("orgs").doc(orgId)
      .collection("recipes").doc(recipeId)
      .collection("ingredients").doc();

    await ingRef.set({
      catalogItemId,
      name: catData.name,
      qty: Number(qty),
      unit: effectiveUnit,
      baseQty: effectiveQtyInBase,
      baseUnit: catData.baseUnit,
      unitCost,
      lineCost,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Recalcular totales de la receta
    const { totalCost, foodCostPct } = await recalcRecipe(orgId, recipeId);

    return NextResponse.json({ ok: true, id: ingRef.id, lineCost, totalCost, foodCostPct });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}

// ─── Conversión de unidades básica ──────────────────────────────
// Returns null if conversion is unknown (caller must handle error)
function convertToBase(qty: number, from: string, toBase: string): number | null {
  const conversions: Record<string, Record<string, number>> = {
    kg: { g: 1000 },
    g: { kg: 0.001 },
    L: { ml: 1000 },
    ml: { L: 0.001 },
  };

  if (from === toBase) return qty;
  const factor = conversions[from]?.[toBase];
  if (factor) return qty * factor;

  // Unknown conversion: return null to signal error
  return null;
}
