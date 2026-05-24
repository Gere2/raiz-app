"use client"

import { useSimpleAuth } from "@/contexts/simple-auth-context"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { User, LogOut, UserPlus } from "lucide-react"
import { useState } from "react"
import { RegisterUserDialog } from "@/components/register-user-dialog"

export function UserMenu() {
  const { user, signOut } = useSimpleAuth()
  const router = useRouter()
  const [showRegister, setShowRegister] = useState(false)

  const handleSignOut = () => {
    signOut()
    router.push("/login")
  }

  if (!user) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            {user.name} ({user.role === "admin" ? "Administrador" : "Vendedor"})
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {user.role === "admin" && (
            <DropdownMenuItem onClick={() => setShowRegister(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              <span>Nuevo usuario</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            <span>Cerrar sesión</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showRegister && <RegisterUserDialog onClose={() => setShowRegister(false)} />}
    </>
  )
}
