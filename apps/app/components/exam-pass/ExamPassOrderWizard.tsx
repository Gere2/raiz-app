"use client"

/**
 * Wrapper del wizard de canje del bono.
 *
 * Decide qué step renderizar leyendo `step` de la URL, mantiene la selección
 * en query string para refresh/back-friendly, y orquesta navegación entre
 * pasos (saltando "milk" si la bebida no la lleva).
 *
 * El último paso ("pastry") avanza a `/bono/pedir/resumen` con la query
 * preservada. Esta capa NO llama al backend — el redeem ocurre en /resumen.
 */

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { ArrowLeft } from "lucide-react"
import { useLanguage } from "@/components/language-provider"
import {
  productHasMilk,
  type ExtraId,
  type MilkId,
  type PastryId,
  type ProductId,
} from "@/lib/exam-pass"
import {
  buildQueryString,
  nextStep,
  prevStep,
  readSelection,
  readStep,
  stepNumber,
  totalSteps,
  visibleExtras,
  type Selection,
} from "./wizard-state"
import { ExamPassDrinkStep } from "./ExamPassDrinkStep"
import { ExamPassMilkStep } from "./ExamPassMilkStep"
import { ExamPassExtrasStep } from "./ExamPassExtrasStep"
import { ExamPassPastryStep } from "./ExamPassPastryStep"

export function ExamPassOrderWizard() {
  const router = useRouter()
  const params = useSearchParams()
  const { locale } = useLanguage()

  const sel = useMemo(() => readSelection(params), [params])
  const currentStep = useMemo(() => {
    const requested = readStep(params)
    // Si el step pedido es "milk" pero la bebida no la lleva, saltamos a
    // "extras" para que la URL no caiga en un step inválido.
    if (requested === "milk" && sel.productId && !productHasMilk(sel.productId)) {
      return "extras"
    }
    return requested
  }, [params, sel.productId])

  const handleSelectProduct = (productId: ProductId) => {
    // Cambiar de bebida a una sin leche borra el milkId previo. También
    // borra "iced_version" si la nueva bebida ya es iced.
    const newSel: Selection = {
      ...sel,
      productId,
    }
    if (!productHasMilk(productId)) {
      newSel.milkId = undefined
    }
    if (newSel.extras.includes("iced_version")) {
      const after = visibleExtras(newSel).map((e) => e.id) as ExtraId[]
      newSel.extras = newSel.extras.filter((id) => after.includes(id))
    }
    const next = nextStep("drink", newSel)
    if (next) {
      router.push(`/bono/pedir${buildQueryString(newSel, next)}`)
    } else {
      router.push(`/bono/pedir/resumen${buildQueryString(newSel)}`)
    }
  }

  const handleSelectMilk = (milkId: MilkId) => {
    const newSel = { ...sel, milkId }
    const next = nextStep("milk", newSel)
    if (next) router.push(`/bono/pedir${buildQueryString(newSel, next)}`)
    else router.push(`/bono/pedir/resumen${buildQueryString(newSel)}`)
  }

  const handleToggleExtra = (id: ExtraId) => {
    const has = sel.extras.includes(id)
    const newSel: Selection = {
      ...sel,
      extras: has ? sel.extras.filter((e) => e !== id) : [...sel.extras, id],
    }
    // Permanecemos en "extras" — usuario aún puede seguir editando.
    router.replace(`/bono/pedir${buildQueryString(newSel, "extras")}`)
  }

  const handleSelectPastry = (id: PastryId | null) => {
    const newSel: Selection = { ...sel, pastryId: id ?? undefined }
    if (id === null) {
      // "No, gracias" → saltar al resumen sin pastry. Quedarse aquí
      // confunde al usuario, que espera que avance.
      router.push(`/bono/pedir/resumen${buildQueryString(newSel)}`)
      return
    }
    router.replace(`/bono/pedir${buildQueryString(newSel, "pastry")}`)
  }

  const goNext = () => {
    const next = nextStep(currentStep, sel)
    if (next) router.push(`/bono/pedir${buildQueryString(sel, next)}`)
    else router.push(`/bono/pedir/resumen${buildQueryString(sel)}`)
  }

  const goBack = () => {
    const prev = prevStep(currentStep, sel)
    if (prev) router.push(`/bono/pedir${buildQueryString(sel, prev)}`)
    else router.push("/bono")
  }

  const stepN = stepNumber(currentStep, sel)
  const total = totalSteps(sel)

  // ── Validez para "siguiente" ───────────────────────────────────
  // drink: necesita productId.
  // milk:  necesita milkId.
  // extras: opcional (siempre permite siguiente).
  // pastry: opcional (siempre permite siguiente).
  let canGoNext = true
  if (currentStep === "drink") canGoNext = !!sel.productId
  if (currentStep === "milk") canGoNext = !!sel.milkId

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-brand-500 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          {locale === "es" ? "Atrás" : "Back"}
        </button>
        <span className="text-xs uppercase tracking-wide text-brand-400">
          {locale === "es" ? "Paso" : "Step"} {stepN} / {total}
        </span>
      </div>

      {/* Step body */}
      {currentStep === "drink" && (
        <ExamPassDrinkStep
          selectedProductId={sel.productId}
          onSelect={handleSelectProduct}
        />
      )}
      {currentStep === "milk" && (
        <ExamPassMilkStep
          selectedMilkId={sel.milkId}
          onSelect={handleSelectMilk}
        />
      )}
      {currentStep === "extras" && (
        <ExamPassExtrasStep
          extras={sel.extras}
          visibleOptions={visibleExtras(sel)}
          onToggle={handleToggleExtra}
        />
      )}
      {currentStep === "pastry" && (
        <ExamPassPastryStep
          selectedPastryId={sel.pastryId}
          onSelect={handleSelectPastry}
          onSkip={() => {
            // "No, gracias" → ir al resumen sin pastry.
            const cleared: Selection = { ...sel, pastryId: undefined }
            router.push(`/bono/pedir/resumen${buildQueryString(cleared)}`)
          }}
        />
      )}

      {/* Botón siguiente — drink/milk avanzan al elegir, así que solo lo
          mostramos en extras/pastry (que son opcionales). */}
      {(currentStep === "extras" || currentStep === "pastry") && (
        <button
          type="button"
          onClick={goNext}
          disabled={!canGoNext}
          className="w-full rounded-2xl bg-leaf-600 px-4 py-4 font-semibold text-white shadow-lg shadow-leaf-600/20 hover:bg-leaf-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {currentStep === "pastry"
            ? locale === "es"
              ? "Ver resumen"
              : "View summary"
            : locale === "es"
              ? "Siguiente"
              : "Next"}
        </button>
      )}

      <Link
        href="/bono"
        className="block text-center text-sm text-brand-500 hover:text-brand-700 underline"
      >
        {locale === "es" ? "Cancelar pedido" : "Cancel order"}
      </Link>
    </div>
  )
}
