"use client";

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product } from "@/types";
import { useCart } from "@/components/cart-provider";
import { toast } from "sonner";
import Link from "next/link";

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { addItem, totalItems } = useCart();

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch categories para mapear ID -> nombre
        const catSnap = await getDocs(collection(db, "categories"));
        const catMap: Record<string, string> = {};
        catSnap.docs.forEach((doc) => {
          catMap[doc.id] = doc.data().name || doc.id;
        });
        setCategoryMap(catMap);

        // Fetch products
        const prodSnap = await getDocs(collection(db, "products"));
        const prods = prodSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Product[];
        setProducts(prods);
      } catch (error) {
        console.error("Error cargando datos:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Agrupar por categoría resolviendo ID a nombre
  const categories = products.reduce((acc, product) => {
    const catName = categoryMap[product.category] || product.category || "Otros";
    if (!acc[catName]) acc[catName] = [];
    acc[catName].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-leaf-600 border-t-transparent" />
        <p className="text-brand-600">Cargando carta...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-brand-900">Nuestra carta</h1>
        <p className="mt-1 text-brand-600">Elige lo que te apetece y te lo preparamos</p>
      </div>

      {Object.entries(categories).map(([category, items]) => (
        <section key={category}>
          <div className="mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-brand-200" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-leaf-700">{category}</h2>
            <div className="h-px flex-1 bg-brand-200" />
          </div>
          <div className="space-y-2">
            {items.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-xl border border-brand-200 bg-white p-4 shadow-sm transition-all hover:shadow-md hover:border-leaf-300">
                <div className="flex-1">
                  <p className="font-medium text-brand-900">{product.name}</p>
                  {product.origin && <p className="mt-0.5 text-xs text-brand-500">Origen: {product.origin}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-brand-800">{product.price.toFixed(2)} €</span>
                  <button
                    onClick={() => { addItem(product); toast.success(product.name + " añadido"); }}
                    className="rounded-full bg-leaf-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-leaf-700 active:scale-95"
                  >
                    + Añadir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {products.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-xl">🌿</p>
          <p className="mt-2 text-brand-500">No hay productos disponibles ahora mismo</p>
        </div>
      )}

      {totalItems > 0 && (
        <Link href="/cart" className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-leaf-600 px-5 py-3 text-sm font-medium text-white shadow-lg transition-all hover:bg-leaf-700 hover:scale-105 active:scale-95">
          🛒 Ver carrito ({totalItems})
        </Link>
      )}
    </div>
  );
}
