/**
 * __tests__/org-scope.test.ts
 *
 * Verifica el primitivo de aislamiento por org: requireOrgMember.
 * Tras el hardening de Fase 2 (ver SECURITY-ORGSCOPE-AUDIT.md), TODAS las
 * rutas treasury + CRUD org-scoped llaman a requireOrgMember(req, orgId), así
 * que basta con probar este primitivo para cubrir la fuga cross-org:
 *   - 403 si el usuario autenticado NO es miembro del org pedido
 *   - devuelve el usuario si SÍ es miembro
 *   - 401 si no hay token válido
 *
 * Run: npx vitest run __tests__/org-scope.test.ts
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted: los mocks se crean antes de que vi.mock evalúe la factory.
const { verifyIdToken, memberGet } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  memberGet: vi.fn(),
}));

vi.mock("../lib/firebase-admin", () => ({
  adminAuth: { verifyIdToken },
  db: {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({ get: memberGet }),
        }),
      }),
    }),
  },
}));

import { requireOrgMember } from "../lib/require-auth";

function fakeReq(): Request {
  // requireAuth solo lee req.headers.get("authorization")
  return { headers: { get: () => "Bearer faketoken" } } as unknown as Request;
}

describe("requireOrgMember — aislamiento por org", () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
    memberGet.mockReset();
    // Por defecto: token válido para uid "outsider".
    verifyIdToken.mockResolvedValue({ uid: "outsider", email: null });
  });

  it("lanza 403 si el usuario NO es miembro del org", async () => {
    memberGet.mockResolvedValue({ exists: false });
    await expect(requireOrgMember(fakeReq(), "org-ajeno")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("devuelve el usuario si SÍ es miembro del org", async () => {
    memberGet.mockResolvedValue({ exists: true });
    const user = await requireOrgMember(fakeReq(), "org-propio");
    expect(user.uid).toBe("outsider");
  });

  it("lanza 401 si no hay token válido", async () => {
    verifyIdToken.mockRejectedValue(new Error("bad token"));
    await expect(requireOrgMember(fakeReq(), "cualquier-org")).rejects.toMatchObject({
      status: 401,
    });
  });
});
