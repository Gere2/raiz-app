"use client"

import { useEffect, useState } from "react"
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { RoleGuard } from "@/components/role-guard"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"
import {
  Sparkles, PackageSearch, ArrowRight, AlertCircle, ShoppingCart, Loader2
} from "lucide-react"

type Prediction = {
  ingredient: string
  purchased: number
  sold: number
  unit: string
  stockLevel: "high" | "medium" | "low" | "critical"
  warning?: string
}

export default function MagicInventoryPage() {
  return (
    <RoleGuard allowedRoles={["admin"]} fallbackRoute="/pos">
      <MagicInventoryContent />
    </RoleGuard>
  )
}

function MagicInventoryContent() {
  const { user } = useAuth()
  const { orgId } = useOrg(user)
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMagicData() {
      if (!orgId) return

      try {
        setLoading(true)
        // Simulate reading Brain Invoices and POS Tickets to compute a diff
        // In a real scenario, we'd query /orgs/{orgId}/invoices and /orgs/{orgId}/tickets
        const [invoicesSnap, ticketsSnap] = await Promise.all([
          getDocs(query(collection(db, "orgs", orgId, "invoices"), orderBy("createdAt", "desc"), limit(20))),
          getDocs(query(collection(db, "orgs", orgId, "tickets"), orderBy("date", "desc"), limit(100)))
        ])

        const invoicesCount = invoicesSnap.docs.length
        const ticketsCount = ticketsSnap.docs.length

        // Mock AI computation for now, visualizing how it "predicts"
        const mockPredictions: Prediction[] = [
          {
            ingredient: "Leche Entera", purchased: 50, sold: 42, unit: "litros", stockLevel: "critical", 
            warning: "Basado en tus facturas, te quedan 8 litros. A este ritmo, se acabará mañana al mediodía."
          },
          {
            ingredient: "Café en Grano (Especialidad)", purchased: 15, sold: 5, unit: "kg", stockLevel: "high",
          },
          {
            ingredient: "Azúcar Morena", purchased: 10, sold: 8, unit: "kg", stockLevel: "low",
            warning: "Considera reponer en tu próximo pedido a proveedor."
          },
          {
            ingredient: "Vasos Cartón Take-Away", purchased: 500, sold: 210, unit: "uds", stockLevel: "medium",
          }
        ]

        setTimeout(() => {
          setPredictions(mockPredictions)
          setLoading(false)
        }, 1500) // Fake AI think time

      } catch (e) {
        console.error("Error generating magic inventory:", e)
        setLoading(false)
      }
    }

    fetchMagicData()
  }, [orgId])

  return (
    <AuthenticatedLayout>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-xl">
              <Sparkles className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 group flex items-center gap-2">
                Inventario Mágico
                <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full font-medium">IA de Brain</span>
              </h1>
              <p className="text-sm text-gray-500">
                Predicciones cruzando tus Compras (Facturas) vs Ventas (POS)
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <Loader2 className="h-10 w-10 animate-spin text-purple-600 mb-4" />
            <p className="text-gray-600 font-medium">Brain está analizando tus facturas y tickets...</p>
            <p className="text-gray-400 text-sm mt-1">Calculando desgaste de ingredientes</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {predictions.map((p, idx) => (
              <div 
                key={idx} 
                className={`bg-white rounded-2xl p-5 border shadow-sm transition-all hover:shadow-md
                  ${p.stockLevel === 'critical' ? 'border-red-200' : 
                    p.stockLevel === 'low' ? 'border-amber-200' : 'border-gray-100'}`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                      <PackageSearch className="h-5 w-5 text-gray-400" />
                      {p.ingredient}
                    </h3>
                    
                    {p.warning && (
                      <div className={`mt-2 flex items-start gap-2 text-sm p-3 rounded-xl
                        ${p.stockLevel === 'critical' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}
                      >
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <p>{p.warning}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-6 bg-gray-50 px-6 py-4 rounded-xl">
                    <div className="text-center">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Comprado</p>
                      <p className="text-xl font-bold text-gray-900">{p.purchased} <span className="text-sm text-gray-500 font-normal">{p.unit}</span></p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-300" />
                    <div className="text-center">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Vendido</p>
                      <p className="text-xl font-bold text-gray-900">{p.sold} <span className="text-sm text-gray-500 font-normal">{p.unit}</span></p>
                    </div>
                    <div className="w-px h-10 bg-gray-200 mx-2"></div>
                    <div className="text-center">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">Stock Estimado</p>
                      <p className={`text-2xl font-black
                        ${p.stockLevel === 'critical' ? 'text-red-600' : 
                          p.stockLevel === 'low' ? 'text-amber-600' : 
                            p.stockLevel === 'medium' ? 'text-blue-600' : 'text-green-600'}`}
                      >
                        {p.purchased - p.sold} <span className="text-sm font-normal">{p.unit}</span>
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  )
}
