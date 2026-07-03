import { NextResponse } from "next/server";
import { requireAuth, requireOrgMember } from "@/lib/require-auth";
import { db, FieldValue } from "@/lib/firebase-admin";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/treasury/categorize
 *
 * Usa Claude AI para sugerir categorías y proveedores para movimientos pendientes.
 * Body: { movementIds?: string[] } — si vacío, categoriza todos los pendientes (max 50)
 *
 * Returns: { suggestions: [{ movementId, suggestedCategory, suggestedSupplier, confidence }] }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;
    await requireOrgMember(req, orgId);
    const body = await req.json().catch(() => ({}));

    // Get movements to categorize
    const movementIds = body.movementIds as string[] | undefined;
    let movements: Array<{ id: string; concept: string; amount: number; date: string }>;

    if (movementIds && movementIds.length > 0) {
      // Fetch specific movements
      const refs = movementIds.slice(0, 50).map(id =>
        db.collection("orgs").doc(orgId).collection("bank_movements").doc(id)
      );
      const snaps = await db.getAll(...refs);
      movements = snaps
        .filter(s => s.exists)
        .map(s => ({ id: s.id, ...(s.data() as { concept: string; amount: number; date: string }) }));
    } else {
      // Fetch pending movements
      const snap = await db
        .collection("orgs").doc(orgId)
        .collection("bank_movements")
        .where("status", "==", "pending")
        .limit(50)
        .get();
      movements = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as { concept: string; amount: number; date: string }),
      }));
    }

    if (movements.length === 0) {
      return NextResponse.json({ ok: true, suggestions: [], message: "No hay movimientos pendientes" });
    }

    // Fetch existing suppliers for context
    const suppSnap = await db
      .collection("orgs").doc(orgId)
      .collection("suppliers")
      .get();
    const suppliers = suppSnap.docs.map(d => ({ id: d.id, name: d.data().name }));

    // Ask Claude to categorize
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY no configurada" },
        { status: 500 }
      );
    }

    const movementsList = movements.map(m => ({
      id: m.id,
      concept: m.concept,
      amount: m.amount,
      date: m.date,
    }));

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
        messages: [
          {
            role: "user",
            content: `Eres un asistente financiero para un café/restaurante universitario llamado "Raíz y Grano".

Categoriza estos movimientos bancarios. Responde SOLO con JSON puro:

{
  "suggestions": [
    {
      "movementId": "id_del_movimiento",
      "suggestedCategory": "categoria",
      "suggestedSupplier": "nombre del proveedor o null",
      "confidence": 0.85,
      "reasoning": "breve explicación"
    }
  ]
}

CATEGORÍAS VÁLIDAS:
- materia_prima: Ingredientes, alimentos, bebidas, café en grano
- packaging: Vasos, tapas, bolsas, servilletas, envases
- servicios: Asesoría, contabilidad, limpieza profesional, software
- alquiler: Alquiler del local, renting
- suministros: Electricidad, agua, gas, internet, teléfono
- personal: Nóminas, seguridad social, formación
- impuestos: IVA, IRPF, tasas municipales, impuestos
- seguros: Seguros del local, responsabilidad civil
- marketing: Publicidad, redes sociales, eventos promocionales
- equipamiento: Máquinas de café, mobiliario, utensilios
- mantenimiento: Reparaciones, revisiones técnicas
- bancarios: Comisiones, intereses, gastos bancarios
- logistica: Transporte, envíos, mensajería
- otros: Lo que no encaje en ninguna otra

PROVEEDORES CONOCIDOS del negocio:
${suppliers.map(s => `- ${s.name} (id: ${s.id})`).join("\n") || "(ninguno registrado aún)"}

MOVIMIENTOS A CATEGORIZAR:
${JSON.stringify(movementsList, null, 2)}

REGLAS:
- confidence: 0.0 a 1.0 (qué tan seguro estás de la categoría)
- Si reconoces un proveedor existente, usa su nombre exacto
- Si es un proveedor nuevo, sugiere el nombre limpio
- Para transferencias internas o movimientos ambiguos, usa "otros" con confidence baja`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      throw { status: 502, message: "Error al procesar con Claude" };
    }

    const claudeData = await claudeRes.json();
    const textBlock = claudeData.content?.find(
      (b: { type: string }) => b.type === "text"
    );

    if (!textBlock?.text) {
      throw { status: 502, message: "Claude no devolvió respuesta" };
    }

    const clean = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(clean);

    // Auto-apply high-confidence suggestions (>= 0.8)
    const autoApply = body.autoApply !== false;
    let applied = 0;

    if (autoApply && result.suggestions) {
      const batch = db.batch();
      for (const s of result.suggestions) {
        if (s.confidence >= 0.8) {
          const ref = db
            .collection("orgs").doc(orgId)
            .collection("bank_movements").doc(s.movementId);

          const updateData: Record<string, unknown> = {
            category: s.suggestedCategory,
            conceptNormalized: s.suggestedSupplier || null,
            status: "categorized",
            updatedAt: FieldValue.serverTimestamp(),
          };

          // Match to existing supplier if possible
          const matchedSupplier = suppliers.find(
            sup => sup.name.toLowerCase() === s.suggestedSupplier?.toLowerCase()
          );
          if (matchedSupplier) {
            updateData.supplierId = matchedSupplier.id;
            updateData.supplierName = matchedSupplier.name;
            updateData.status = "matched";
          } else if (s.suggestedSupplier) {
            updateData.supplierName = s.suggestedSupplier;
          }

          batch.update(ref, updateData);
          applied++;
        }
      }
      if (applied > 0) await batch.commit();
    }

    return NextResponse.json({
      ok: true,
      suggestions: result.suggestions,
      autoApplied: applied,
      total: result.suggestions?.length || 0,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    console.error("Treasury categorize error:", err);
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
