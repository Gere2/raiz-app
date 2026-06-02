import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { db } from "@/lib/firebase-admin";

type Params = { params: Promise<{ orgId: string }> };

const CATEGORY_LABELS: Record<string, string> = {
  materia_prima: "Materia prima",
  packaging: "Packaging",
  servicios: "Servicios profesionales",
  alquiler: "Alquiler",
  suministros: "Suministros (luz, agua, gas)",
  personal: "Personal",
  impuestos: "Impuestos y tasas",
  seguros: "Seguros",
  marketing: "Marketing y publicidad",
  equipamiento: "Equipamiento",
  mantenimiento: "Mantenimiento",
  bancarios: "Gastos bancarios",
  logistica: "Logística y transporte",
  otros: "Otros",
};

/**
 * GET /api/org/[orgId]/treasury/quarterly?quarter=2026-Q1
 *
 * Genera un resumen trimestral agregado de gastos e ingresos.
 * Si no se especifica quarter, devuelve el trimestre actual.
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const url = new URL(req.url);

    let quarter = url.searchParams.get("quarter");

    // Default to current quarter
    if (!quarter) {
      const now = new Date();
      const q = Math.ceil((now.getMonth() + 1) / 3);
      quarter = `${now.getFullYear()}-Q${q}`;
    }

    const match = quarter.match(/^(\d{4})-Q([1-4])$/);
    if (!match) {
      return NextResponse.json(
        { error: "Formato de trimestre inválido. Usa YYYY-Q[1-4]" },
        { status: 400 }
      );
    }

    const year = parseInt(match[1]);
    const q = parseInt(match[2]) as 1 | 2 | 3 | 4;
    const startMonth = (q - 1) * 3;
    const startDate = `${year}-${String(startMonth + 1).padStart(2, "0")}-01`;
    const endMonth = startMonth + 3;
    const endDate = endMonth >= 12
      ? `${year + 1}-01-01`
      : `${year}-${String(endMonth + 1).padStart(2, "0")}-01`;

    // Fetch all movements in this quarter
    const snap = await db
      .collection("orgs").doc(orgId)
      .collection("bank_movements")
      .where("date", ">=", startDate)
      .where("date", "<", endDate)
      .orderBy("date", "asc")
      .get();

    const movements = snap.docs.map(d => d.data());

    // Calculate totals
    let totalExpenses = 0;
    let totalIncome = 0;
    const categoryMap: Record<string, { total: number; count: number }> = {};
    const supplierMap: Record<string, { supplierId?: string; supplierName: string; total: number; count: number }> = {};

    for (const m of movements) {
      if (m.amount < 0) {
        totalExpenses += Math.abs(m.amount);

        // By category
        const cat = m.category || "otros";
        if (!categoryMap[cat]) categoryMap[cat] = { total: 0, count: 0 };
        categoryMap[cat].total += Math.abs(m.amount);
        categoryMap[cat].count++;

        // By supplier
        const suppName = m.supplierName || m.conceptNormalized || m.concept || "Desconocido";
        const suppKey = (m.supplierId || suppName).toLowerCase();
        if (!supplierMap[suppKey]) {
          supplierMap[suppKey] = {
            supplierId: m.supplierId,
            supplierName: suppName,
            total: 0,
            count: 0,
          };
        }
        supplierMap[suppKey].total += Math.abs(m.amount);
        supplierMap[suppKey].count++;
      } else {
        totalIncome += m.amount;
      }
    }

    // Build category breakdown
    const byCategory = Object.entries(categoryMap)
      .map(([category, data]) => ({
        category,
        label: CATEGORY_LABELS[category] || category,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
        percentage: totalExpenses > 0
          ? Math.round((data.total / totalExpenses) * 10000) / 100
          : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Top suppliers
    const topSuppliers = Object.values(supplierMap)
      .map(s => ({
        ...s,
        total: Math.round(s.total * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15);

    // Previous quarter comparison
    let vsPrevQuarter;
    const prevQ = q === 1 ? 4 : q - 1;
    const prevYear = q === 1 ? year - 1 : year;
    const prevStartMonth = (prevQ - 1) * 3;
    const prevStartDate = `${prevYear}-${String(prevStartMonth + 1).padStart(2, "0")}-01`;
    const prevEndMonth = prevStartMonth + 3;
    const prevEndDate = prevEndMonth >= 12
      ? `${prevYear + 1}-01-01`
      : `${prevYear}-${String(prevEndMonth + 1).padStart(2, "0")}-01`;

    const prevSnap = await db
      .collection("orgs").doc(orgId)
      .collection("bank_movements")
      .where("date", ">=", prevStartDate)
      .where("date", "<", prevEndDate)
      .where("type", "==", "gasto")
      .get();

    if (!prevSnap.empty) {
      const prevExpenses = prevSnap.docs.reduce(
        (sum, d) => sum + Math.abs(d.data().amount || 0), 0
      );
      if (prevExpenses > 0) {
        const delta = totalExpenses - prevExpenses;
        vsPrevQuarter = {
          expensesDelta: Math.round(delta * 100) / 100,
          expensesDeltaPct: Math.round((delta / prevExpenses) * 10000) / 100,
        };
      }
    }

    // Count pending categorization
    const pendingSnap = await db
      .collection("orgs").doc(orgId)
      .collection("bank_movements")
      .where("date", ">=", startDate)
      .where("date", "<", endDate)
      .where("status", "==", "pending")
      .count()
      .get();
    const pendingCount = pendingSnap.data().count;

    const summary = {
      quarter,
      year,
      quarterNumber: q,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      totalIncome: Math.round(totalIncome * 100) / 100,
      netFlow: Math.round((totalIncome - totalExpenses) * 100) / 100,
      totalMovements: movements.length,
      pendingCategorization: pendingCount,
      byCategory,
      topSuppliers,
      vsPrevQuarter,
    };

    return NextResponse.json({ ok: true, ...summary });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("Treasury quarterly error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
