"use client"
"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Store,
  User,
  CreditCard,
  Printer,
  Database,
  HelpCircle,
  Receipt,
  Download,
  Upload,
  BarChart,
  Bell,
  Zap,
  Shield,
  Smartphone,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { toast } from "@/components/ui/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { getFiscalData, saveFiscalData, initializeTicketCounter, type FiscalData } from "@/lib/fiscal-service"
import { getLastTicketNumber } from "@/lib/ticket-service"
import { Loader2 } from "lucide-react"
import { RaizGranoLogo } from "@/components/cafe-icons"
import { HelpDrawer } from "@/components/help-drawer"
import { useAuth } from "@/components/auth-provider"
import { useOrg } from "@/hooks/useOrg"

export default function SettingsPage() {
  const { user } = useAuth()
  const { orgId } = useOrg(user)
  const [businessName, setBusinessName] = useState("RAÍZ y GRANO")
  const [address, setAddress] = useState("Calle Principal 123")
  const [phone, setPhone] = useState("555-123-4567")
  const [taxRate, setTaxRate] = useState("16")
  const [printerEnabled, setPrinterEnabled] = useState(true)
  const [darkMode, setDarkMode] = useState(false)
  const [backupEnabled, setBackupEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(true)
  const [securityEnabled, setSecurityEnabled] = useState(true)
  const [offlineModeEnabled, setOfflineModeEnabled] = useState(false)

  // Datos fiscales
  const [fiscalData, setFiscalData] = useState<FiscalData>({
    businessName: "RAÍZ y GRANO",
    taxId: "",
    address: "",
    phone: "",
    email: "",
    additionalInfo: "",
  })

  // Contador de tickets
  const [ticketCounter, setTicketCounter] = useState<number>(1)
  const [loadingFiscal, setLoadingFiscal] = useState(false)
  const [savingFiscal, setSavingFiscal] = useState(false)
  const [loadingCounter, setLoadingCounter] = useState(false)
  const [savingCounter, setSavingCounter] = useState(false)

  useEffect(() => {
    loadFiscalData()
    loadTicketCounter()
  }, [])

  const loadFiscalData = async () => {
    try {
      setLoadingFiscal(true)
      const data = await getFiscalData()
      if (data) {
        setFiscalData(data)
      }
    } catch (error) {
      console.error("Error al cargar datos fiscales:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron cargar los datos fiscales",
      })
    } finally {
      setLoadingFiscal(false)
    }
  }

  const loadTicketCounter = async () => {
    if (!orgId) return
    try {
      setLoadingCounter(true)
      const lastNumber = await getLastTicketNumber(orgId)
      setTicketCounter(lastNumber + 1)
    } catch (error) {
      console.error("Error al cargar contador de tickets:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo cargar el contador de tickets",
      })
    } finally {
      setLoadingCounter(false)
    }
  }

  const handleSaveBusinessInfo = () => {
    // En una app real, esto guardaría la información en Firebase
    toast({
      title: "Información guardada",
      description: "La información del negocio se ha guardado correctamente",
    })
  }

  const handleSaveFiscalData = async () => {
    try {
      setSavingFiscal(true)
      await saveFiscalData(fiscalData)
      toast({
        title: "Datos fiscales guardados",
        description: "Los datos fiscales se han guardado correctamente",
      })
    } catch (error) {
      console.error("Error al guardar datos fiscales:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudieron guardar los datos fiscales",
      })
    } finally {
      setSavingFiscal(false)
    }
  }

  const handleInitializeCounter = async () => {
    if (!confirm(`¿Estás seguro de que quieres inicializar el contador de tickets en ${ticketCounter}?`)) {
      return
    }

    try {
      setSavingCounter(true)
      if (!orgId) throw new Error("No hay café seleccionado")
      await initializeTicketCounter(orgId, ticketCounter)
      toast({
        title: "Contador inicializado",
        description: `El contador de tickets se ha inicializado en ${ticketCounter}`,
      })
    } catch (error) {
      console.error("Error al inicializar contador:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo inicializar el contador de tickets",
      })
    } finally {
      setSavingCounter(false)
    }
  }

  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!darkMode)
    if (!darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
  }

  const handleBackupData = () => {
    toast({
      title: "Respaldo iniciado",
      description: "Se está creando un respaldo de tus datos...",
    })

    // Simulación de respaldo
    setTimeout(() => {
      toast({
        title: "Respaldo completado",
        description: "Tus datos han sido respaldados correctamente",
        variant: "success",
      })
    }, 2000)
  }

  const handleRestoreData = () => {
    toast({
      title: "Restauración iniciada",
      description: "Se están restaurando tus datos...",
    })

    // Simulación de restauración
    setTimeout(() => {
      toast({
        title: "Restauración completada",
        description: "Tus datos han sido restaurados correctamente",
        variant: "success",
      })
    }, 2000)
  }

  return (
    <AuthenticatedLayout>
      <div className={`container max-w-md mx-auto px-4 py-4 h-[100dvh] flex flex-col ${darkMode ? "dark" : ""}`}>
        <header className="flex items-center justify-between mb-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Configuración</h1>
          <div className="w-9"></div> {/* Spacer for alignment */}
        </header>

        <div className="space-y-4 flex-1 overflow-auto">
          <Dialog>
            <DialogTrigger asChild>
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardContent className="p-4 flex items-center">
                  <Store className="h-5 w-5 mr-3 text-primary" />
                  <div className="flex-1">
                    <h3 className="font-medium">Información del Negocio</h3>
                    <p className="text-sm text-muted-foreground">{businessName}</p>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Información del Negocio</DialogTitle>
                <DialogDescription>Actualiza la información de tu cafetería</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="business-name">Nombre del Negocio</Label>
                  <Input id="business-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Textarea id="address" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tax">Tasa de Impuesto (%)</Label>
                  <Input id="tax" type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
                </div>
                <Button onClick={handleSaveBusinessInfo}>Guardar</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Datos Fiscales */}
          <Dialog>
            <DialogTrigger asChild>
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardContent className="p-4 flex items-center">
                  <Receipt className="h-5 w-5 mr-3 text-primary" />
                  <div className="flex-1">
                    <h3 className="font-medium">Datos Fiscales</h3>
                    <p className="text-sm text-muted-foreground">
                      {loadingFiscal ? "Cargando..." : fiscalData.taxId || "No configurado"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Datos Fiscales</DialogTitle>
                <DialogDescription>Configura los datos fiscales que aparecerán en tus tickets</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="fiscal-business-name">Nombre del Negocio</Label>
                  <Input
                    id="fiscal-business-name"
                    value={fiscalData.businessName}
                    onChange={(e) => setFiscalData({ ...fiscalData, businessName: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fiscal-tax-id">RFC / Identificación Fiscal</Label>
                  <Input
                    id="fiscal-tax-id"
                    value={fiscalData.taxId}
                    onChange={(e) => setFiscalData({ ...fiscalData, taxId: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fiscal-address">Dirección Fiscal</Label>
                  <Textarea
                    id="fiscal-address"
                    value={fiscalData.address}
                    onChange={(e) => setFiscalData({ ...fiscalData, address: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fiscal-phone">Teléfono</Label>
                  <Input
                    id="fiscal-phone"
                    value={fiscalData.phone}
                    onChange={(e) => setFiscalData({ ...fiscalData, phone: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fiscal-email">Correo Electrónico</Label>
                  <Input
                    id="fiscal-email"
                    value={fiscalData.email || ""}
                    onChange={(e) => setFiscalData({ ...fiscalData, email: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fiscal-additional">Información Adicional</Label>
                  <Textarea
                    id="fiscal-additional"
                    value={fiscalData.additionalInfo || ""}
                    onChange={(e) => setFiscalData({ ...fiscalData, additionalInfo: e.target.value })}
                    placeholder="Régimen fiscal, notas, etc."
                  />
                </div>
                <Button onClick={handleSaveFiscalData} disabled={savingFiscal}>
                  {savingFiscal ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    "Guardar Datos Fiscales"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Contador de Tickets */}
          <Dialog>
            <DialogTrigger asChild>
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                <CardContent className="p-4 flex items-center">
                  <Receipt className="h-5 w-5 mr-3 text-primary" />
                  <div className="flex-1">
                    <h3 className="font-medium">Contador de Tickets</h3>
                    <p className="text-sm text-muted-foreground">
                      {loadingCounter ? "Cargando..." : `Próximo ticket: #${ticketCounter}`}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Contador de Tickets</DialogTitle>
                <DialogDescription>Configura el número para el próximo ticket</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="ticket-counter">Número para el próximo ticket</Label>
                  <Input
                    id="ticket-counter"
                    type="number"
                    min="1"
                    value={ticketCounter}
                    onChange={(e) => setTicketCounter(Number.parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este será el número asignado al próximo ticket que se genere.
                  </p>
                </div>
                <Button onClick={handleInitializeCounter} disabled={savingCounter} variant="destructive">
                  {savingCounter ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Inicializando...
                    </>
                  ) : (
                    "Inicializar Contador"
                  )}
                </Button>
                <p className="text-xs text-destructive">
                  ¡Precaución! Esta acción modificará la secuencia de numeración de tickets. Úsala solo si es necesario.
                </p>
              </div>
            </DialogContent>
          </Dialog>

          {/* Respaldo y Restauración */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-4">Respaldo y Restauración</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2"
                    onClick={handleBackupData}
                  >
                    <Download className="h-4 w-4" />
                    <span>Crear Respaldo</span>
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    className="w-full flex items-center justify-center gap-2"
                    onClick={handleRestoreData}
                  >
                    <Upload className="h-4 w-4" />
                    <span>Restaurar Datos</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preferencias */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-4">Preferencias</h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Printer className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="printer" className="font-normal">
                      Impresora Automática
                    </Label>
                  </div>
                  <Switch id="printer" checked={printerEnabled} onCheckedChange={setPrinterEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="backup" className="font-normal">
                      Respaldo Automático
                    </Label>
                  </div>
                  <Switch id="backup" checked={backupEnabled} onCheckedChange={setBackupEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="notifications" className="font-normal">
                      Notificaciones
                    </Label>
                  </div>
                  <Switch id="notifications" checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="auto-update" className="font-normal">
                      Actualización Automática
                    </Label>
                  </div>
                  <Switch id="auto-update" checked={autoUpdateEnabled} onCheckedChange={setAutoUpdateEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="security" className="font-normal">
                      Seguridad Mejorada
                    </Label>
                  </div>
                  <Switch id="security" checked={securityEnabled} onCheckedChange={setSecurityEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="offline-mode" className="font-normal">
                      Modo Sin Conexión
                    </Label>
                  </div>
                  <Switch id="offline-mode" checked={offlineModeEnabled} onCheckedChange={setOfflineModeEnabled} />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 text-muted-foreground"
                    >
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                    <Label htmlFor="dark-mode" className="font-normal">
                      Modo Oscuro
                    </Label>
                  </div>
                  <Switch id="dark-mode" checked={darkMode} onCheckedChange={toggleDarkMode} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-4">Estadísticas</h3>
              <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => {
                  toast({
                    title: "Estadísticas",
                    description: "Generando informe de estadísticas...",
                  })
                }}
              >
                <BarChart className="h-4 w-4" />
                <span>Generar Informe</span>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="font-medium mb-4">Cuenta</h3>

              <div className="space-y-2">
                <div className="flex items-center py-2">
                  <User className="h-5 w-5 mr-3 text-primary" />
                  <div>
                    <h4 className="font-medium">Perfil de Usuario</h4>
                    <p className="text-sm text-muted-foreground">Administrar tu cuenta</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-center py-2">
                  <CreditCard className="h-5 w-5 mr-3 text-primary" />
                  <div>
                    <h4 className="font-medium">Métodos de Pago</h4>
                    <p className="text-sm text-muted-foreground">Gestionar formas de pago</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <HelpCircle className="h-5 w-5 mr-3 text-primary" />
                <div>
                  <h4 className="font-medium">Ayuda y Soporte</h4>
                  <p className="text-sm text-muted-foreground">Contacta con nuestro equipo</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-4">
            <RaizGranoLogo className="h-4 w-4" />
            <span>RAÍZ y GRANO POS v1.0.0</span>
          </div>
        </div>
        <HelpDrawer />
        <Toaster />
      </div>
    </AuthenticatedLayout>
  )
}
