"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Delete } from "lucide-react"

interface NumericKeypadProps {
  onValueChange: (value: string) => void
  maxLength?: number
  showValue?: boolean
  onSubmit?: () => void
}

export function NumericKeypad({ onValueChange, maxLength = 4, showValue = false, onSubmit }: NumericKeypadProps) {
  const [value, setValue] = useState("")

  const handleKeyPress = (key: string) => {
    if (value.length < maxLength) {
      const newValue = value + key
      setValue(newValue)
      onValueChange(newValue)
    }
  }

  const handleDelete = () => {
    const newValue = value.slice(0, -1)
    setValue(newValue)
    onValueChange(newValue)
  }

  const handleClear = () => {
    setValue("")
    onValueChange("")
  }

  return (
    <div className="w-full max-w-xs mx-auto">
      {showValue && (
        <div className="mb-4 text-center">
          <div className="bg-gray-100 p-3 rounded-md text-2xl font-mono tracking-widest">
            {value
              ? value
                  .split("")
                  .map(() => "•")
                  .join("")
              : ""}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <Button
            key={num}
            type="button"
            variant="outline"
            className="h-14 text-xl font-medium"
            onClick={() => handleKeyPress(num.toString())}
          >
            {num}
          </Button>
        ))}

        <Button type="button" variant="outline" className="h-14" onClick={handleClear}>
          <X className="h-5 w-5" />
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-14 text-xl font-medium"
          onClick={() => handleKeyPress("0")}
        >
          0
        </Button>

        <Button type="button" variant="outline" className="h-14" onClick={handleDelete}>
          <Delete className="h-5 w-5" />
        </Button>

        {onSubmit && (
          <Button type="button" className="h-14 col-span-3 mt-2 bg-secondary hover:bg-secondary/80" onClick={onSubmit}>
            Confirmar
          </Button>
        )}
      </div>
    </div>
  )
}
