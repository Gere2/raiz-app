"use client"

import { useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface TicketFilterProps {
  onFilterChange: (filters: {
    dateFrom?: Date
    dateTo?: Date
    minAmount?: number
    maxAmount?: number
    sortBy: string
  }) => void
}

export function TicketFilter({ onFilterChange }: TicketFilterProps) {
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined)
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined)
  const [minAmount, setMinAmount] = useState<string>("")
  const [maxAmount, setMaxAmount] = useState<string>("")
  const [sortBy, setSortBy] = useState<string>("date-desc")

  const handleApplyFilter = () => {
    onFilterChange({
      dateFrom,
      dateTo,
      minAmount: minAmount ? Number(minAmount) : undefined,
      maxAmount: maxAmount ? Number(maxAmount) : undefined,
      sortBy,
    })
  }

  const handleClearFilter = () => {
    setDateFrom(undefined)
    setDateTo(undefined)
    setMinAmount("")
    setMaxAmount("")
    setSortBy("date-desc")

    onFilterChange({
      dateFrom: undefined,
      dateTo: undefined,
      minAmount: undefined,
      maxAmount: undefined,
      sortBy: "date-desc",
    })
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1">
          <Filter className="h-3.5 w-3.5" />
          <span>Filtrar</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium">Filtros de tickets</h4>
            <p className="text-sm text-muted-foreground">Ajusta los filtros para encontrar tickets específicos</p>
          </div>

          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="date-from">Desde</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button id="date-from" variant="outline" className="w-full justify-start text-left font-normal h-8">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "dd/MM/yyyy", { locale: es }) : <span>Seleccionar</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus locale={es} />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1">
                <Label htmlFor="date-to">Hasta</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button id="date-to" variant="outline" className="w-full justify-start text-left font-normal h-8">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "dd/MM/yyyy", { locale: es }) : <span>Seleccionar</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus locale={es} />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="min-amount">Monto mínimo</Label>
                <Input
                  id="min-amount"
                  type="number"
                  placeholder="0.00"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  className="h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="max-amount">Monto máximo</Label>
                <Input
                  id="max-amount"
                  type="number"
                  placeholder="0.00"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="sort-by">Ordenar por</Label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger id="sort-by" className="h-8">
                  <SelectValue placeholder="Seleccionar orden" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">Fecha (más reciente)</SelectItem>
                  <SelectItem value="date-asc">Fecha (más antigua)</SelectItem>
                  <SelectItem value="amount-desc">Monto (mayor a menor)</SelectItem>
                  <SelectItem value="amount-asc">Monto (menor a mayor)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={handleClearFilter}>
              Limpiar
            </Button>
            <Button size="sm" onClick={handleApplyFilter}>
              Aplicar filtros
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
