import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";

type Params = { params: Promise<{ orgId: string }> };

/**
 * POST /api/org/[orgId]/invoices/extract
 *
 * Recibe un PDF de factura, extrae el texto y usa Claude para
 * identificar proveedor, artículos, cantidades y precios.
 *
 * Body: FormData con campo "file" (PDF)
 * Returns: { supplier, date, invoiceNumber, items: [{ name, qty, unit, unitPrice, totalPrice }] }
 */
export async function POST(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
    const { orgId } = await params;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY no configurada en .env.local" },
        { status: 500 }
      );
    }

    // 1. Leer PDF del FormData
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Se requiere un archivo PDF" },
        { status: 400 }
      );
    }

    // 2. Convertir a base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    // 3. Enviar a Claude con vision (PDF como documento)
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
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64,
                },
              },
              {
                type: "text",
                text: `Analiza esta factura de un proveedor de hostelería/alimentación.

Extrae EXACTAMENTE esta información en formato JSON (sin markdown, sin backticks, solo JSON puro):

{
  "supplier": "nombre del proveedor",
  "date": "YYYY-MM-DD",
  "invoiceNumber": "número de factura",
  "items": [
    {
      "name": "nombre del artículo (normalizado, sin códigos internos)",
      "qty": 5,
      "unit": "kg o g o ml o L o ud",
      "packDescription": "descripción del pack tal como aparece (ej: 'caja 6x1L', 'saco 5kg')",
      "unitPrice": 3.50,
      "totalPrice": 17.50
    }
  ],
  "subtotal": 100.00,
  "tax": 10.00,
  "total": 110.00
}

REGLAS:
- "unit" debe ser una de: g, kg, ml, L, ud
- Si el artículo se vende por packs/cajas, "qty" es la cantidad de packs y "unitPrice" es el precio por pack
- Normaliza nombres: quita códigos de producto, ref internas, etc. Deja solo el nombre comercial limpio
- Si no puedes identificar algún campo, usa null
- Responde SOLO con el JSON, nada más`,
              },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude API error:", err);
      return NextResponse.json(
        { error: `Error al procesar con Claude: ${claudeRes.status}` },
        { status: 502 }
      );
    }

    const claudeData = await claudeRes.json();
    const textBlock = claudeData.content?.find(
      (b: { type: string }) => b.type === "text"
    );

    if (!textBlock?.text) {
      return NextResponse.json(
        { error: "Claude no devolvió respuesta" },
        { status: 502 }
      );
    }

    // 4. Parsear JSON de Claude
    let extracted;
    try {
      // Limpiar posibles backticks o texto extra
      const clean = textBlock.text
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      extracted = JSON.parse(clean);
    } catch {
      return NextResponse.json(
        { error: "No se pudo parsear la respuesta de Claude", raw: textBlock.text },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      orgId,
      fileName: file.name,
      extraction: extracted,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
