"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Loader2 } from "lucide-react"
import { addInventoryCategory } from "@/lib/inventory-service"
import { toast } from "@/components/ui/use-toast"

interface AddCategoryButtonProps {
  onCategoryAdded: () => void
}

export function AddCategoryButton({ onCategoryAdded }: AddCategoryButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  })

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Por favor ingresa un nombre para la categoría",
      })
      return
    }

    try {
      setLoading(true)
      console.log("Añadiendo categoría:", formData)

      // Crear un objeto con solo los campos necesarios
      const categoryData: { name: string; description?: string } = {
        name: formData.name,
      }

      // Solo añadir description si tiene un valor
      if (formData.description && formData.description.trim() !== "") {
        categoryData.description = formData.description.trim()
      }

      await addInventoryCategory(categoryData)

      toast({
        title: "Categoría añadida",
        description: "La categoría se ha añadido correctamente",
      })

      // Limpiar formulario
      setFormData({
        name: "",
        description: "",
      })

      // Cerrar diálogo
      setOpen(false)

      // Notificar al componente padre
      onCategoryAdded()
    } catch (error: any) {
      console.error("Error al añadir categoría:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo añadir la categoría",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" className="h-8" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Nueva Categoría
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Añadir Categoría de Inventario</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="border-secondary/30"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="border-secondary/30"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} className="bg-secondary hover:bg-secondary/80" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Añadiendo...
                </>
              ) : (
                "Añadir Categoría"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
