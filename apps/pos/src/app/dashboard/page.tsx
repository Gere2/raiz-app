"use client"

import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { PageContainer } from "@/components/ui-elements/page-container"
import { SectionHeader } from "@/components/ui-elements/section-header"
import UnifiedDashboardPanel from "@/components/pos/unified-dashboard-panel"

export default function DashboardPage() {
  return (
    <AuthenticatedLayout>
      <PageContainer>
        <SectionHeader
          title="Dashboard"
          description="Todos los tickets — POS y App"
        />
        <UnifiedDashboardPanel />
      </PageContainer>
    </AuthenticatedLayout>
  )
}
