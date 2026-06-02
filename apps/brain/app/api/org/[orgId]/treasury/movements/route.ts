import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/org/[orgId]/treasury/movements?quarter=2026-Q1&category=materia_prima&status=pending
 *
 * Lista movimientos bancarios con filtros opcionales.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const url = new URL(req.url);

    const quarter = url.searchParams.get("quarter");
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const type = url.searchParams.get("type"); // "gasto" | "ingreso"
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);

    let query = db
      .collection("orgs").doc(orgId)
      .collection("bank_movements")
      .orderBy("date", "desc")
      .limit(limit) as FirebaseFirestore.Query;

    // Filter by quarter (date range)
    if (quarter) {
      const match = quarter.match(/^(\d{4})-Q([1-4])$/);
      if (match) {
        const year = parseInt(match[1]);
        const q = parseInt(match[2]);
        const startMonth = (q - 1) * 3; // 0-indexed
        const startDate = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
        const endMonth = startMonth + 3;
        const endDate = endMonth > 12
          ? `${year + 1}-01-01`
          : `${year}-${String(endMonth + 1).padStart(2, "0")}-01`;
        query = query.where("date", ">=", startDate).where("date", "<", endDate);
      }
    }

    if (type) {
      query = query.where("type", "==", type);
    }
    if (status) {
      query = query.where("status", "==", status);
    }
    if (category) {
      query = query.where("category", "==", category);
    }

    const snap = await query.get();
    const movements = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ ok: true, movements, total: movements.length });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}

/**
 * PATCH /api/org/[orgId]/treasury/movements
 *
 * Actualiza uno o varios movimientos (categoría, proveedor, notas).
 * Body: { updates: [{ id, category?, supplierId?, supplierName?, notes?, status? }] }
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json();

    const updates = body.updates as Array<{
      id: string;
      category?: string;
      subcategory?: string | null;
      supplierId?: string;
      supplierName?: string;
      notes?: string;
      status?: string;
      flowKind?: string;
      economicMonth?: string | null; // PR4: override mes económico
      classifierSource?: string; // si user corrige manualmente, marca como "manual"
    }>;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "Se requiere un array de 'updates'" },
        { status: 400 }
      );
    }

    const batch = db.batch();
    for (const u of updates) {
      const ref = db
        .collection("orgs").doc(orgId)
        .collection("bank_movements").doc(u.id);

      const data: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (u.category) data.category = u.category;
      if (u.subcategory !== undefined) data.subcategory = u.subcategory;
      if (u.supplierId !== undefined) data.supplierId = u.supplierId;
      if (u.supplierName !== undefined) data.supplierName = u.supplierName;
      if (u.notes !== undefined) data.notes = u.notes;
      if (u.status) data.status = u.status;
      if (u.flowKind) data.flowKind = u.flowKind;
      if (u.classifierSource) data.classifierSource = u.classifierSource;

      // PR4: override del mes económico (validación YYYY-MM o null para limpiar)
      if (u.economicMonth !== undefined) {
        if (u.economicMonth === null || u.economicMonth === "") {
          data.economicMonth = null;
        } else if (/^\d{4}-(0[1-9]|1[0-2])$/.test(u.economicMonth)) {
          data.economicMonth = u.economicMonth;
        } else {
          return NextResponse.json(
            { error: `economicMonth inválido en mov ${u.id}: '${u.economicMonth}'` },
            { status: 400 }
          );
        }
      }

      // Auto-set status if categorized
      if (u.category && !u.status) {
        data.status = u.supplierId ? "matched" : "categorized";
      }

      // Si la edición vino sin classifierSource explícito y cambió category/flowKind/economicMonth,
      // marca como "manual" para que reclassify NO la pise.
      if (
        !u.classifierSource &&
        (u.category || u.flowKind || u.economicMonth !== undefined)
      ) {
        data.classifierSource = "manual";
        data.classifierReason = "Corrección manual desde UI";
      }

      batch.update(ref, data);
    }

    await batch.commit();

    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
