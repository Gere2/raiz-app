import { NextResponse } from "next/server";

/**
 * POST /api/public/extract-invoice
 *
 * Marketplace-ready public endpoint for invoice extraction.
 * Authenticates via API key (X-API-Key header) or marketplace token (Authorization: Bearer).
 *
 * Body: FormData with "file" (PDF) field
 *       OR JSON with "documentBase64" (base64-encoded PDF)
 *
 * Returns: Structured invoice data (supplier, items, totals)
 */
export async function POST(req: Request) {
  try {
    // ── Auth: API key or marketplace token ──
    // SECURITY WARNING: PUBLIC_API_KEYS environment variable contains API keys.
    // Ensure these keys:
    // 1. Are rotatable/regenerable in your system
    // 2. Are NEVER logged in full (only log key prefix like "key_****" for debugging)
    // 3. Should have minimal scopes (e.g., extract-invoice only, not full API access)
    // 4. Are monitored for unusual usage patterns
    // If multiple keys are stored in a single env var, separate them carefully and never
    // log the entire comma-separated string or individual keys in error messages.
    const apiKeyHeader = req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");
    const marketplaceSecret = process.env.MARKETPLACE_API_SECRET;
    const allowedKeys = (process.env.PUBLIC_API_KEYS || "").split(",").filter(Boolean);

    let authenticated = false;

    // Option 1: Direct API key
    if (apiKeyHeader && allowedKeys.includes(apiKeyHeader)) {
      authenticated = true;
    }

    // Option 2: Marketplace shared secret
    if (!authenticated && authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      if (marketplaceSecret && token === marketplaceSecret) {
        authenticated = true;
      }
    }

    if (!authenticated) {
      return NextResponse.json(
        { error: "Unauthorized. Provide X-API-Key header or Bearer token." },
        { status: 401 }
      );
    }

    // ── Read PDF ──
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not configured" },
        { status: 500 }
      );
    }

    let base64: string;
    let fileName = "invoice.pdf";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // FormData upload
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json({ error: "PDF file required" }, { status: 400 });
      }
      const arrayBuffer = await file.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString("base64");
      fileName = file.name;
    } else {
      // JSON with base64
      const body = await req.json();
      if (!body.documentBase64) {
        return NextResponse.json({ error: "Provide 'file' (FormData) or 'documentBase64' (JSON)" }, { status: 400 });
      }
      base64 = body.documentBase64;
      if (body.fileName) fileName = body.fileName;
    }

    // ── Language detection (optional) ──
    const lang = req.headers.get("x-language") || "es";
    const promptLang = lang === "en"
      ? `Analyze this supplier invoice. Extract EXACTLY this information as pure JSON (no markdown, no backticks):

{
  "supplier": "supplier name",
  "date": "YYYY-MM-DD",
  "invoiceNumber": "invoice number",
  "items": [
    {
      "name": "item name (normalized, no internal codes)",
      "qty": 5,
      "unit": "kg or g or ml or L or unit",
      "packDescription": "pack description as shown (e.g. 'box 6x1L', 'bag 5kg')",
      "unitPrice": 3.50,
      "totalPrice": 17.50
    }
  ],
  "subtotal": 100.00,
  "tax": 10.00,
  "total": 110.00
}

RULES:
- "unit" must be one of: g, kg, ml, L, unit
- If sold by pack/case, "qty" is number of packs, "unitPrice" is price per pack
- Normalize names: remove product codes, internal refs. Keep only clean commercial name
- If a field cannot be identified, use null
- Respond ONLY with JSON, nothing else`
      : `Analiza esta factura de un proveedor.
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
- Normaliza nombres: quita códigos de producto, ref internas. Deja solo el nombre comercial limpio
- Si no puedes identificar algún campo, usa null
- Responde SOLO con el JSON, nada más`;

    // ── Call Claude ──
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
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
                source: { type: "base64", media_type: "application/pdf", data: base64 },
              },
              { type: "text", text: promptLang },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude API error:", err);
      return NextResponse.json(
        { error: `AI processing error: ${claudeRes.status}` },
        { status: 502 }
      );
    }

    const claudeData = await claudeRes.json();
    const textBlock = claudeData.content?.find((b: { type: string }) => b.type === "text");

    if (!textBlock?.text) {
      return NextResponse.json({ error: "No response from AI" }, { status: 502 });
    }

    // ── Parse result ──
    let extracted;
    try {
      const clean = textBlock.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      extracted = JSON.parse(clean);
    } catch (parseErr) {
      // Log raw response internally for debugging, but return generic error to client
      console.error("Failed to parse Claude response:", textBlock.text);
      return NextResponse.json(
        { error: "Failed to parse extracted invoice data. Please ensure the PDF is a valid invoice." },
        { status: 422 }
      );
    }

    // ── Usage tracking (for marketplace billing) ──
    const usage = {
      inputTokens: claudeData.usage?.input_tokens || 0,
      outputTokens: claudeData.usage?.output_tokens || 0,
      model: "claude-sonnet-4-20250514",
    };

    return NextResponse.json({
      ok: true,
      fileName,
      extraction: extracted,
      usage,
    });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Server error" },
      { status: err.status || 500 }
    );
  }
}
