import { NextRequest, NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/seasonal-suggestions/create-recipe
 * Crear una receta a partir de una sugerencia estacional.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { orgId } = await params;
    const user = await requireOrgMember(req, orgId);
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    const recipeRef = await db.collection("orgs").doc(orgId).collection("recipes").add({
      name,
      yieldQty: 1,
      yieldUnit: "unidad",
      sellingPrice: 0,
      totalCost: 0,
      foodCostPct: 0,
      source: "seasonal-suggestion",
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: recipeRef.id });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
