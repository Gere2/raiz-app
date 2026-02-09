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
  const [loading, setLoading] = useState(true);
  const { addItem, totalItems } = useCart();

  useEffect(() => {
    async function fetchProducts() {
      try {
        const snapshot = await getDocs(collection(db, "products"));
        const prods = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Product[];
        setProducts(prods);
      } catch (error) {
        console.error("Error cargando productos:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProducts();
  }, []);

  const categories = products.reduce((acc, product) => {
    const cat = product.category || "Otros";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Cargando carta...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Nuestra carta</h1>
        <p className="text-gray-500">Elige lo que te apetece y te lo preparamos</p>
      </div>

      {Object.entries(categories).map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-lg font-semibold">{category}</h2>
          <div className="space-y-2">
            {items.map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-gray-50">
                <div className="flex-1">
                  <p className="font-medium">{product.name}</p>
                  {product.origin && <p className="text-xs text-gray-400">Origen: {product.origin}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{product.price.toFixed(2)} &euro;</span>
                  <button
                    onClick={() => { addItem(product); toast.success(product.name + " a\u00f1adido"); }}
                    className="rounded-full bg-black px-3 py-1.5 text-sm text-white transition-colors hover:bg-gray-800"
                  >
                    + A\u00f1adir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      {products.length === 0 && (
        <p className="py-10 text-center text-gray-400">No hay productos disponibles ahora mismo</p>
      )}

      {totalItems > 0 && (
        <Link href="/cart" className="fixed bottom-6 right-6 flex items-center gap-2 rounded-full bg-black px-5 py-3 text-sm font-medium text-white shadow-lg transition-transform hover:scale-105">
          Ver carrito ({totalItems})
        </Link>
      )}
    </div>
  );
}
