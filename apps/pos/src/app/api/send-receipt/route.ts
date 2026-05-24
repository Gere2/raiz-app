import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { rateLimit } from "@/lib/rate-limiter";

// Email sending: 10 per minute per IP to prevent spam
const limiter = rateLimit({ windowMs: 60_000, max: 10, message: "Demasiados envíos de recibo. Espera un momento." });

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // Rate limiting
  const limited = limiter.check(req);
  if (limited) return limited;
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing RESEND_API_KEY (not configured in production)" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);

    const { to, ticket } = await req.json();

    if (!to || !ticket) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const itemsRows = (ticket.items || [])
      .map((item: any) => {
        const qty = item.quantity || item.qty || 1;
        const name = item.product?.name || item.name || "Item";
        const priceNum = Number(item.price ?? item.total ?? 0);

        return `
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #f0ebe3;font-size:14px">
              ${qty}x ${name}
            </td>
            <td style="padding:8px 12px;border-bottom:1px solid #f0ebe3;text-align:right;font-size:14px">
              €${priceNum.toFixed(2)}
            </td>
          </tr>
        `;
      })
      .join("");

    const totalNum = Number(ticket.total ?? 0);

    const html = `
      <div style="font-family:Arial,sans-serif;background:#f8f5f0;padding:24px">
        <div style="max-width:480px;margin:auto;background:white;padding:24px;border-radius:8px">
          <h2 style="color:#4b3f2f;margin-bottom:16px">Raíz y Grano</h2>
          <p style="font-size:14px;color:#666">Gracias por tu compra</p>

          <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;border-collapse:collapse">
            ${itemsRows}
          </table>

          <hr style="margin:20px 0;border:none;border-top:1px solid #eee"/>

          <p style="text-align:right;font-size:16px;font-weight:bold">
            Total: €${totalNum.toFixed(2)}
          </p>
        </div>
      </div>
    `;

    const { error } = await resend.emails.send({
      from: "Raíz y Grano <onboarding@resend.dev>",
      to,
      subject: "Tu recibo — Raíz y Grano",
      html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Internal error" },
      { status: 500 }
    );
  }
}
