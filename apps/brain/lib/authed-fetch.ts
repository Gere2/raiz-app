"use client";

import type { User } from "firebase/auth";

/**
 * fetch con Bearer token inyectado automáticamente
 */
export async function authedFetch(
  user: User,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const token = await user.getIdToken();
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
