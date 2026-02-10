import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md p-6 text-sm text-gray-500">Cargando…</div>}>
      <LoginClient />
    </Suspense>
  );
}
