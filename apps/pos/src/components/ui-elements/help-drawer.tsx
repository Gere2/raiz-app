"use client"

import { DrawerFooter } from "@/components/ui/drawer"

import { useState } from "react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { HelpCircle, X } from "lucide-react"

interface HelpDrawerProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function HelpDrawer({ open: controlledOpen, onOpenChange }: HelpDrawerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)

  // Determinar si el componente está controlado o no
  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = isControlled ? onOpenChange : setUncontrolledOpen

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="fixed bottom-4 right-4 rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <HelpCircle className="h-5 w-5" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="h-[85vh]">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-xl font-serif">Centro de Ayuda</DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
          <DrawerDescription>Encuentra respuestas a tus preguntas y aprende a usar el sistema</DrawerDescription>
        </DrawerHeader>

        <div className="p-4">
          <p>Aquí encontrarás información útil sobre cómo usar el sistema.</p>
        </div>

        <DrawerFooter className="border-t pt-4">
          <p className="text-center text-sm text-muted-foreground">
            Si necesitas más ayuda, contacta al administrador del sistema.
          </p>
          <DrawerClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
