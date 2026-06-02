import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { COLLECTIONS } from "@/lib/firebase-collections";

function convertQtyToBase(qty: number, unit: string, baseUnit: string) {
  const norm = (u: string) => u.trim().toLowerCase();
  const u = norm(unit);
  const b = norm(baseUnit);

  if (u === b) return qty;

  // ml <-> L
  if (u === "l" && b === "ml") return qty * 1000;
  if (u === "ml" && b === "l") return qty / 1000;

  // g <-> kg
  if (u === "kg" && b === "g") return qty * 1000;
  if (u === "g" && b === "kg") return qty / 1000;

  throw new Error(`Conversión no soportada: ${unit} -> ${baseUnit}`);
}

async function recalcRecipeTotal(orgId: string, recipeId: string) {
  const snap = await db
    .collection(COLLECTIONS.ORGS).doc(orgId)
    .collection(COLLECTIONS.RECIPES).doc(recipeId)
    .collection(COLLECTIONS.INGREDIENTS)
    .get();

  const total = snap.docs.reduce((acc, d) => acc + Number(d.data().lineCost ?? 0), 0);

  await db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.RECIPES).doc(recipeId).set({
    totalCost: total,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return total;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string; recipeId: string }> }
) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId, recipeId } = await params;
    await requireOrgMember(req, orgId);

    const body = await req.json().catch(() => ({}));
    const catalogItemId = (body?.catalogItemId ?? "").toString().trim();
    const qty = Number(body?.qty ?? 0);
    const unit = (body?.unit ?? "").toString().trim(); // puede ser ml/g/ud o L/kg

    if (!catalogItemId) return NextResponse.json({ error: "catalogItemId obligatorio" }, { status: 400 });
    if (!Number.isFinite(qty) || qty <= 0) return NextResponse.json({ error: "qty inválido" }, { status: 400 });
    if (!unit) return NextResponse.json({ error: "unit obligatorio" }, { status: 400 });

    const itemRef = db.collection(COLLECTIONS.ORGS).doc(orgId).collection(COLLECTIONS.CATALOG).doc(catalogItemId);
    const itemSnap = await itemRef.get();
    if (!itemSnap.exists) return NextResponse.json({ error: "Catalog item no existe" }, { status: 404 });

    const item = itemSnap.data() as any;
    const baseUnit = (item.baseUnit ?? "").toString();
    const unitCost = Number(item.unitCost ?? 0);

    const baseQty = convertQtyToBase(qty, unit, baseUnit);
    const lineCost = baseQty * unitCost;

    const ingRef = db
      .collection(COLLECTIONS.ORGS).doc(orgId)
      .collection(COLLECTIONS.RECIPES).doc(recipeId)
      .collection(COLLECTIONS.INGREDIENTS).doc();

    await ingRef.set({
      catalogItemId,
      name: item.name,
      qty,
      unit,
      baseQty,
      baseUnit,
      unitCost,
      lineCost,
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const totalCost = await recalcRecipeTotal(orgId, recipeId);
    return NextResponse.json({ ok: true, id: ingRef.id, totalCost });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    const status = err?.status || 500;
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status });
  }
}
