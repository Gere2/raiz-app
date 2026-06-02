import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

type InvoiceItem = {
  name: string;
  qty: number;
  unit: string;
  packDescription?: string;
  unitPrice: number;
  totalPrice: number;
  // Frontend adds these after review:
  action: "create" | "update" | "skip";
  catalogItemId?: string; // if updating existing
  baseUnit?: string;      // g, ml, ud, kg, L
  packQty?: number;       // how many baseUnits per pack
};

/**
 * POST /api/org/[orgId]/invoices/apply
 *
 * Aplica los datos extraídos de una factura al catálogo.
 * Para cada artículo según su "action":
 *   - "create": crea nuevo item en catálogo
 *   - "update": actualiza packCost y recalcula unitCost del item existente
 *   - "skip": ignora
 *
 * Después recalcula todas las recetas afectadas.
 *
 * Body: { supplier, items: InvoiceItem[] }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const { uid } = await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const { supplier, items } = (await req.json()) as {
      supplier: string;
      items: InvoiceItem[];
    };

    if (!items || !Array.isArray(items)) {
      return NextResponse.json({ error: "items es obligatorio" }, { status: 400 });
    }

    const results: Array<{ name: string; action: string; id?: string; unitCost?: number }> = [];
    const affectedCatalogIds: string[] = [];

    for (const item of items) {
      if (item.action === "skip") {
        results.push({ name: item.name, action: "skipped" });
        continue;
      }

      if (item.action === "update" && item.catalogItemId) {
        // ── Actualizar item existente ──
        const ref = db.collection("orgs").doc(orgId).collection("catalog").doc(item.catalogItemId);
        const snap = await ref.get();
        if (!snap.exists) {
          results.push({ name: item.name, action: "error: not found" });
          continue;
        }

        const existing = snap.data()!;
        const packQty = Math.max(1, Number(item.packQty) || Number(existing.packQty) || 1);
        if (packQty <= 0) {
          results.push({ name: item.name, action: "error: invalid packQty" });
          continue;
        }
        const packCost = item.unitPrice; // unitPrice from invoice = price per pack
        const unitCost = packCost / packQty;

        await ref.update({
          packCost,
          unitCost,
          supplier: supplier || existing.supplier,
          updatedAt: FieldValue.serverTimestamp(),
        });

        affectedCatalogIds.push(item.catalogItemId);
        results.push({ name: item.name, action: "updated", id: item.catalogItemId, unitCost });

      } else if (item.action === "create") {
        // ── Crear nuevo item ──
        const baseUnit = item.baseUnit || item.unit || "ud";
        const packQty = Math.max(1, Number(item.packQty) || Number(item.qty) || 1);
        if (packQty <= 0) {
          results.push({ name: item.name, action: "error: invalid packQty" });
          continue;
        }
        const packCost = item.unitPrice;
        const unitCost = packCost / packQty;

        const ref = db.collection("orgs").doc(orgId).collection("catalog").doc();
        await ref.set({
          name: item.name,
          baseUnit,
          packQty,
          packUnit: item.packDescription || `${packQty}${baseUnit}`,
          packCost,
          unitCost,
          supplier: supplier || "",
          createdBy: uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        results.push({ name: item.name, action: "created", id: ref.id, unitCost });
      }
    }

    // ── Recalcular recetas afectadas (con batch para atomicidad) ──
    let recipesUpdated = 0;

    if (affectedCatalogIds.length > 0) {
      // Batch fetch all affected catalog items to avoid N+1 queries
      const catalogMap = new Map<string, { unitCost?: number }>();
      const catalogSnap = await db
        .collection("orgs").doc(orgId)
        .collection("catalog")
        .where("__name__", "in", affectedCatalogIds)
        .get();

      catalogSnap.docs.forEach(doc => {
        catalogMap.set(doc.id, doc.data());
      });

      // Buscar todas las recetas
      const recipesSnap = await db
        .collection("orgs").doc(orgId)
        .collection("recipes")
        .get();

      // Create batch for all ingredient and recipe updates
      let batch = db.batch();
      let batchOpsCount = 0;
      const MAX_BATCH_OPS = 500; // Firestore limit

      for (const recipeDoc of recipesSnap.docs) {
        const ingSnap = await recipeDoc.ref.collection("ingredients").get();
        let needsUpdate = false;
        let newTotalCost = 0;

        for (const ingDoc of ingSnap.docs) {
          const ingData = ingDoc.data();

          if (affectedCatalogIds.includes(ingData.catalogItemId)) {
            // Este ingrediente usa un artículo actualizado → lookup from map (O(1))
            const catData = catalogMap.get(ingData.catalogItemId);

            if (catData) {
              const newUnitCost = catData.unitCost || 0;
              const baseQty = ingData.baseQty || ingData.qty || 0;
              const newLineCost = baseQty * newUnitCost;

              batch.update(ingDoc.ref, {
                unitCost: newUnitCost,
                lineCost: newLineCost,
                updatedAt: FieldValue.serverTimestamp(),
              });
              batchOpsCount++;

              newTotalCost += newLineCost;
              needsUpdate = true;
            }
          } else {
            newTotalCost += Number(ingData.lineCost) || 0;
          }
        }

        if (needsUpdate) {
          const sellingPrice = Number(recipeDoc.data().sellingPrice) || 0;
          const foodCostPct = sellingPrice > 0 ? (newTotalCost / sellingPrice) * 100 : 0;

          batch.update(recipeDoc.ref, {
            totalCost: newTotalCost,
            foodCostPct,
            updatedAt: FieldValue.serverTimestamp(),
          });
          batchOpsCount++;
          recipesUpdated++;

          // Commit batch if approaching limit and create a new one
          if (batchOpsCount >= MAX_BATCH_OPS) {
            await batch.commit();
            batch = db.batch();
            batchOpsCount = 0;
          }
        }
      }

      // Commit remaining batch
      if (batchOpsCount > 0) {
        await batch.commit();
      }
    }

    return NextResponse.json({
      ok: true,
      results,
      recipesUpdated,
      summary: {
        created: results.filter(r => r.action === "created").length,
        updated: results.filter(r => r.action === "updated").length,
        skipped: results.filter(r => r.action === "skipped").length,
        recipesRecalculated: recipesUpdated,
      },
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
