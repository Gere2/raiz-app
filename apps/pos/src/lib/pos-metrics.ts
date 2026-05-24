// POS Metrics Tracking
// Measure performance during high-traffic periods

export interface TicketMetrics {
  ticketId: string
  startTime: number
  endTime?: number
  tapCount: number
  itemCount: number
  comboUsed: boolean
  peakMode: boolean
  undoCount: number
  paymentMethod?: string
  total: number
}

export class PosMetricsTracker {
  private metrics: TicketMetrics | null = null

  startTicket(ticketId: string): void {
    this.metrics = {
      ticketId,
      startTime: Date.now(),
      tapCount: 0,
      itemCount: 0,
      comboUsed: false,
      peakMode: false,
      undoCount: 0,
      total: 0,
    }
  }

  recordTap(): void {
    if (this.metrics) {
      this.metrics.tapCount++
    }
  }

  recordCombo(): void {
    if (this.metrics) {
      this.metrics.comboUsed = true
    }
  }

  recordUndo(): void {
    if (this.metrics) {
      this.metrics.undoCount++
    }
  }

  setPeakMode(active: boolean): void {
    if (this.metrics) {
      this.metrics.peakMode = active
    }
  }

  completeTicket(itemCount: number, total: number, paymentMethod: string): TicketMetrics | null {
    if (!this.metrics) return null

    const completed: TicketMetrics = {
      ...this.metrics,
      endTime: Date.now(),
      itemCount,
      total,
      paymentMethod,
    }

    this.logMetrics(completed)
    this.metrics = null

    return completed
  }

  private logMetrics(metrics: TicketMetrics): void {
    const duration = (metrics.endTime || Date.now()) - metrics.startTime

    const logData = {
      metric: "pos.ticket_complete",
      ticketId: metrics.ticketId,
      duration_ms: duration,
      tapCount: metrics.tapCount,
      itemCount: metrics.itemCount,
      comboUsed: metrics.comboUsed,
      peakMode: metrics.peakMode,
      undoCount: metrics.undoCount,
      total: metrics.total,
      paymentMethod: metrics.paymentMethod,
      ts: new Date().toISOString(),
    }

    console.log(JSON.stringify(logData))
  }
}

export const posMetricsTracker = new PosMetricsTracker()
