"use client"

import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { PageContainer } from "@/components/ui-elements/page-container"
import { SectionHeader } from "@/components/ui-elements/section-header"
import InsightsPanel from "@/components/pos/insights-panel"

export default function InsightsPage() {
  return (
    <AuthenticatedLayout>
      <PageContainer>
        <SectionHeader
          title="Insights"
          description="Análisis de datos para optimización de franquicia"
        />
        <InsightsPanel />
      </PageContainer>
    </AuthenticatedLayout>
  )
}
