"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, Search, Edit, Trash2, Eye, EyeOff } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getProducts,
  getCategories,
  addProduct,
  updateProduct,
  deleteProduct,
  toggleProductAvailability,
  type Product,
  type Category,
} from "@/lib/product-service"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { toast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"

export default function ProductsPage() {
  const { user } = useAuth()
  const { orgId } = useOrg(user)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    category: "",
    origin: "",
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!orgId) return
    loadData()
  }, [orgId])

  const loadData = async () => {
    try {
      const [productsData, categoriesData] = await Promise.all([getProducts(orgId), getCategories(orgId)])
      setProducts(productsData)
      setCategories(categoriesData)
    } catch (error) {
      console.error("Error al cargar datos:", error)
      toast({ variant: "destructive", title: "Error", description: "No se pudieron cargar los datos" })
    }
  }

  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.origin && product.origin.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesCategory = categoryFilter === "all" || product.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const handleAddProduct = async () => {
    if (!formData.name || !formData.price || !formData.category) {
      toast({ variant: "destructive", title: "Error", description: "Por favor completa los campos obligatorios" })
      return
    }
    setLoading(true)
    try {
      await addProduct(orgId, {
        name: formData.name,
        price: Number.parseFloat(formData.price),
        category: formData.category,
        origin: formData.origin || undefined,
      })
      await loadData()
      resetForm()
      setIsAddDialogOpen(false)
      toast({ title: "Producto añadido", description: "El producto se ha añadido correctamente" })
    } catch (error) {
      console.error("Error al añadir producto:", error)
      toast({ variant: "destructive", title: "Error", description: "No se pudo añadir el producto" })
    } finally {
      setLoading(false)
    }
  }

  const handleEditProduct = async () => {
    if (!currentProduct || !formData.name || !formData.price || !formData.category) {
      toast({ variant: "destructive", title: "Error", description: "Por favor completa los campos obligatorios" })
      return
    }
    setLoading(true)
    try {
      await updateProduct(orgId, currentProduct.id, {
        name: formData.name,
        price: Number.parseFloat(formData.price),
        category: formData.category,
        origin: formData.origin || undefined,
      })
      await loadData()
      resetForm()
      setIsEditDialogOpen(false)
      toast({ title: "Producto actualizado", description: "El producto se ha actualizado correctamente" })
    } catch (error) {
      console.error("Error al actualizar producto:", error)
      toast({ variant: "destructive", title: "Error", description: "No se pudo actualizar el producto" })
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este producto?")) return
    try {
      await deleteProduct(orgId, id)
      await loadData()
      toast({ title: "Producto eliminado", description: "El producto se ha eliminado correctamente" })
    } catch (error) {
      console.error("Error al eliminar producto:", error)
      toast({ variant: "destructive", title: "Error", description: "No se pudo eliminar el producto" })
    }
  }

  const handleToggleAvailability = async (product: Product) => {
    const newVal = product.available === false ? true : false
    try {
      await toggleProductAvailability(orgId, product.id, newVal)
      await loadData()
      toast({
        title: newVal ? "Visible en APP" : "Oculto en APP",
        description: newVal ? `${product.name} ya aparece en la app` : `${product.name} ya no aparece en la app`,
      })
    } catch (error) {
      console.error("Error al cambiar disponibilidad:", error)
      toast({ variant: "destructive", title: "Error", description: "No se pudo cambiar la disponibilidad" })
    }
  }

  const resetForm = () => {
    setFormData({ name: "", price: "", category: "", origin: "" })
    setCurrentProduct(null)
  }

  const openEditDialog = (product: Product) => {
    setCurrentProduct(product)
    setFormData({
      name: product.name,
      price: product.price.toString(),
      category: product.category,
      origin: product.origin || "",
    })
    setIsEditDialogOpen(true)
  }

  return (
    <AuthenticatedLayout>
      <div className="container max-w-md mx-auto px-4 py-4 h-[100dvh] flex flex-col">
        <header className="flex items-center justify-between mb-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold font-serif">Gestión de Productos</h1>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost">
                <Plus className="h-5 w-5" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">Añadir Producto</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nombre *</Label>
                  <Input id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="border-secondary/30" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="price">Precio *</Label>
                  <Input id="price" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="border-secondary/30" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Categoría *</Label>
                  <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                    <SelectTrigger className="border-secondary/30"><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                    <SelectContent>{categories.map((category) => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="origin">Origen (opcional)</Label>
                  <Input id="origin" value={formData.origin} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} className="border-secondary/30" />
                </div>
                <DialogFooter>
                  <Button onClick={handleAddProduct} className="bg-secondary hover:bg-secondary/80" disabled={loading}>{loading ? "Añadiendo..." : "Añadir"}</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        <div className="flex flex-col md:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar productos..." className="pl-9 border-secondary/30" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[130px] border-secondary/30"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((category) => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="flex-1 border-secondary/30">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-lg font-serif">Productos ({filteredProducts.length})</CardTitle>
          </CardHeader>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <div className="p-3 space-y-3">
              {filteredProducts.length === 0 ? (
                <div className="text-center p-4 text-muted-foreground italic">No se encontraron productos</div>
              ) : (
                filteredProducts.map((product) => (
                  <Card key={product.id} className={`border-secondary/20 ${product.available === false ? "opacity-50" : ""}`}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{product.name}</span>
                            {product.available === false && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium">No visible en APP</span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {categories.find((c) => c.id === product.category)?.name}
                          </div>
                          {product.origin && (
                            <div className="text-xs text-secondary italic">Origen: {product.origin}</div>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <div className="font-medium">${product.price.toFixed(2)}</div>
                          <div className="flex items-center gap-1 mt-2">
                            <Button variant="ghost" size="icon" className={`h-7 w-7 ${product.available === false ? "text-red-500" : "text-green-600"}`} onClick={() => handleToggleAvailability(product)} title={product.available === false ? "Mostrar en APP" : "Ocultar en APP"}>
                              {product.available === false ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDialog(product)}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteProduct(product.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">Editar Producto</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nombre *</Label>
                <Input id="edit-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="border-secondary/30" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-price">Precio *</Label>
                <Input id="edit-price" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} className="border-secondary/30" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">Categoría *</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger className="border-secondary/30"><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                  <SelectContent>{categories.map((category) => (<SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-origin">Origen (opcional)</Label>
                <Input id="edit-origin" value={formData.origin} onChange={(e) => setFormData({ ...formData, origin: e.target.value })} className="border-secondary/30" />
              </div>
              <DialogFooter>
                <Button onClick={handleEditProduct} className="bg-secondary hover:bg-secondary/80" disabled={loading}>{loading ? "Guardando..." : "Guardar"}</Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Toaster />
      </div>
    </AuthenticatedLayout>
  )
}
