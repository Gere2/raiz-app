"use client";

import { createContext, useContext } from "react";
import { brandForHost, type BrainBrand } from "./brand";

/** Default = Raíz (host desconocido). El provider lo sobreescribe con el host
 *  real resuelto en el layout (server), así no hay flash de hidratación. */
const BrandContext = createContext<BrainBrand>(brandForHost(null));

export function BrandProvider({
  host,
  children,
}: {
  host: string | null;
  children: React.ReactNode;
}) {
  return <BrandContext.Provider value={brandForHost(host)}>{children}</BrandContext.Provider>;
}

/** Marca del Brain resuelta por host. */
export function useBrand(): BrainBrand {
  return useContext(BrandContext);
}
