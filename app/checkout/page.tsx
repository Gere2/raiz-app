import { Suspense } from "react";
import CheckoutClient from "./CheckoutClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-lg p-6 text-sm text-gray-500">Cargando…</div>}>
      <CheckoutClient />
    </Suspense>
  );
}
