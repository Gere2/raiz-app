/**
 * /api/staging/[...path] — thin proxy to the singularidad-engine staging API.
 *
 * The singularidad-engine Python service exposes an idempotent HTTP wrapper
 * over brain/invoices (see singularidad-engine/brain/invoices/httpapi.py).
 * This Next.js route just forwards GET/POST to it, adding the shared-secret
 * token from env and a requireAuth() check so only logged-in brain users
 * can reach it.
 *
 * Env:
 *   STAGING_ENGINE_URL   — e.g. "http://127.0.0.1:8765" (required)
 *   STAGING_API_TOKEN    — shared secret matching singularidad-engine
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/require-auth";

const DEFAULT_URL = "http://127.0.0.1:8765";

type Params = { params: Promise<{ path: string[] }> };

async function forward(req: Request, { params }: Params) {
  try {
    await requireAuth(req);
  } catch (e) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json(
      { error: err.message ?? "Unauthorized" },
      { status: err.status ?? 401 }
    );
  }

  const base = (process.env.STAGING_ENGINE_URL || DEFAULT_URL).replace(/\/+$/, "");
  const { path } = await params;
  const url = new URL(req.url);
  const target = `${base}/${(path || []).join("/")}${url.search || ""}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = process.env.STAGING_API_TOKEN;
  if (token) headers["X-Staging-Token"] = token;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const upstream = await fetch(target, init);
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const err = e as { message?: string };
    return NextResponse.json(
      { error: `Staging engine unreachable at ${base}: ${err.message ?? e}` },
      { status: 502 }
    );
  }
}

export async function GET(req: Request, ctx: Params) {
  return forward(req, ctx);
}
export async function POST(req: Request, ctx: Params) {
  return forward(req, ctx);
}
