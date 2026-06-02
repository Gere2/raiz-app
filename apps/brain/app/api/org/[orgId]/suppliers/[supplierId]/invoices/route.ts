import { NextResponse } from "next/server";
import { db, FieldValue } from "@/lib/firebase-admin";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string; supplierId: string }> };

/**
 * POST /api/org/[orgId]/suppliers/[supplierId]/invoices
 * Sube PDF → Claude extrae → guarda factura en subcollection del proveedor
 *
 * Body: FormData con campo "file" (PDF)
 */
export async function POST(req: Request, { params }: Params) {
  const requestId = globalThis.crypto.randomUUID();
  try {
    const { uid } = await requireAuth(req);
    const { orgId, supplierId } = await params;
    await requireOrgMember(req, orgId);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY no configurada" }, { status: 500 });
    }

    // Verificar proveedor
    const suppSnap = await db.collection("orgs").doc(orgId).collection("suppliers").doc(supplierId).get();
    if (!suppSnap.exists) {
      return NextResponse.json({ error: "Proveedor no encontrado" }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Se requiere un PDF" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // Claude extraction
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            {
              type: "text",
              text: `Analiza esta factura. Extrae en JSON puro (sin markdown):
{
  "date": "YYYY-MM-DD",
  "invoiceNumber": "número",
  "items": [
    { "name": "nombre limpio", "qty": 5, "unit": "kg|g|ml|L|ud", "packDescription": "tal como aparece", "unitPrice": 3.50, "totalPrice": 17.50 }
  ],
  "subtotal": 100.00, "tax": 10.00, "total": 110.00
}
Normaliza nombres (sin códigos internos). Responde SOLO JSON.`,
            },
          ],
        }],
      }),
    });

    if (!claudeRes.ok) {
      return NextResponse.json({ error: `Claude error: ${claudeRes.status}` }, { status: 502 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.find((b: { type: string }) => b.type === "text")?.text;
    if (!text) return NextResponse.json({ error: "Sin respuesta de Claude" }, { status: 502 });

    let extracted;
    try {
      extracted = JSON.parse(text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim());
    } catch {
      return NextResponse.json({ error: "JSON inválido de Claude", raw: text }, { status: 422 });
    }

    // Validate extraction completeness
    if (!extracted.date || !extracted.invoiceNumber) {
      return NextResponse.json(
        { error: "Extracción incompleta: falta date o invoiceNumber", extraction: extracted },
        { status: 422 }
      );
    }

    // Guardar factura en subcollection
    const invRef = db.collection("orgs").doc(orgId)
      .collection("suppliers").doc(supplierId)
      .collection("invoices").doc();

    await invRef.set({
      date: extracted.date,
      invoiceNumber: extracted.invoiceNumber,
      fileName: file.name,
      items: extracted.items || [],
      subtotal: extracted.subtotal || 0,
      tax: extracted.tax || 0,
      total: extracted.total || 0,
      status: "pending", // pending → applied | rejected
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      ok: true,
      invoiceId: invRef.id,
      supplierName: suppSnap.data()?.name,
      extraction: extracted,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error", requestId }, { status: err.status || 500 });
  }
}

/**
 * GET /api/org/[orgId]/suppliers/[supplierId]/invoices
 * Lista facturas de un proveedor
 */
export async function GET(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId, supplierId } = await params;
    await requireOrgMember(req, orgId);

    const snap = await db.collection("orgs").doc(orgId)
      .collection("suppliers").doc(supplierId)
      .collection("invoices")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const invoices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ invoices });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ error: err.message ?? "Server error" }, { status: err.status || 500 });
  }
}
