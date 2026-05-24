import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  QUICK_COMBOS,
  getComboById,
  getTopCombos,
  type QuickCombo,
} from "../../../apps/pos/src/lib/pos-combos"
import {
  MODIFIERS,
  getModifiersByGroup,
  calculateModifierPrice,
  type Modifier,
} from "../../../apps/pos/src/lib/pos-modifiers"
import {
  PosMetricsTracker,
  type TicketMetrics,
} from "../../../apps/pos/src/lib/pos-metrics"

describe("POS Speed Utilities", () => {
  // ═══════════════════════════════════════════════════════════════
  // pos-combos.ts Tests
  // ═══════════════════════════════════════════════════════════════

  describe("pos-combos", () => {
    it("QUICK_COMBOS has at least 3 combos", () => {
      expect(QUICK_COMBOS.length).toBeGreaterThanOrEqual(3)
    })

    it("each combo has id, name, emoji, and items", () => {
      QUICK_COMBOS.forEach((combo) => {
        expect(combo).toHaveProperty("id")
        expect(combo).toHaveProperty("name")
        expect(combo).toHaveProperty("emoji")
        expect(combo).toHaveProperty("items")
        expect(typeof combo.id).toBe("string")
        expect(typeof combo.name).toBe("string")
        expect(typeof combo.emoji).toBe("string")
        expect(Array.isArray(combo.items)).toBe(true)
      })
    })

    it("each combo item has productName and qty > 0", () => {
      QUICK_COMBOS.forEach((combo) => {
        combo.items.forEach((item) => {
          expect(item).toHaveProperty("productName")
          expect(item).toHaveProperty("qty")
          expect(typeof item.productName).toBe("string")
          expect(typeof item.qty).toBe("number")
          expect(item.qty).toBeGreaterThan(0)
        })
      })
    })

    it("getComboById returns correct combo", () => {
      const combo = getComboById("combo-cafe-bizcocho")
      expect(combo).toBeDefined()
      expect(combo?.id).toBe("combo-cafe-bizcocho")
      expect(combo?.name).toBe("Café + Bizcocho")
    })

    it("getComboById returns undefined for invalid id", () => {
      const combo = getComboById("invalid-combo-id")
      expect(combo).toBeUndefined()
    })

    it("getTopCombos returns correct number", () => {
      const top3 = getTopCombos(3)
      expect(top3.length).toBe(3)

      const top2 = getTopCombos(2)
      expect(top2.length).toBe(2)

      const all = getTopCombos(100)
      expect(all.length).toBe(QUICK_COMBOS.length)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // pos-modifiers.ts Tests
  // ═══════════════════════════════════════════════════════════════

  describe("pos-modifiers", () => {
    it("MODIFIERS has at least 5 modifiers", () => {
      expect(MODIFIERS.length).toBeGreaterThanOrEqual(5)
    })

    it("each modifier has id, name, group", () => {
      MODIFIERS.forEach((modifier) => {
        expect(modifier).toHaveProperty("id")
        expect(modifier).toHaveProperty("name")
        expect(modifier).toHaveProperty("group")
        expect(typeof modifier.id).toBe("string")
        expect(typeof modifier.name).toBe("string")
        expect(["milk", "extra", "special", "quantity"]).toContain(modifier.group)
      })
    })

    it("priceAdjustment is >= 0 for all", () => {
      MODIFIERS.forEach((modifier) => {
        expect(modifier).toHaveProperty("priceAdjustment")
        expect(typeof modifier.priceAdjustment).toBe("number")
        expect(modifier.priceAdjustment).toBeGreaterThanOrEqual(0)
      })
    })

    it("getModifiersByGroup returns correct group", () => {
      const milkModifiers = getModifiersByGroup("milk")
      expect(milkModifiers.length).toBeGreaterThan(0)
      milkModifiers.forEach((mod) => {
        expect(mod.group).toBe("milk")
      })

      const extraModifiers = getModifiersByGroup("extra")
      expect(extraModifiers.length).toBeGreaterThan(0)
      extraModifiers.forEach((mod) => {
        expect(mod.group).toBe("extra")
      })

      const specialModifiers = getModifiersByGroup("special")
      expect(specialModifiers.length).toBeGreaterThan(0)
      specialModifiers.forEach((mod) => {
        expect(mod.group).toBe("special")
      })
    })

    it("calculateModifierPrice sums correctly", () => {
      // Test single modifier
      const singlePrice = calculateModifierPrice(["milk-veg"])
      expect(singlePrice).toBe(0.30)

      // Test multiple modifiers
      const multiPrice = calculateModifierPrice(["milk-veg", "extra-shot"])
      expect(multiPrice).toBeCloseTo(0.30 + 0.40, 2)

      // Test empty array
      const emptyPrice = calculateModifierPrice([])
      expect(emptyPrice).toBe(0)

      // Test non-existent modifier (should be ignored, treated as 0)
      const unknownPrice = calculateModifierPrice(["non-existent-id"])
      expect(unknownPrice).toBe(0)

      // Test combination
      const comboPrice = calculateModifierPrice(["milk-veg", "double-shot", "decaf"])
      expect(comboPrice).toBeCloseTo(0.30 + 0.60 + 0, 2)
    })
  })

  // ═══════════════════════════════════════════════════════════════
  // pos-metrics.ts Tests
  // ═══════════════════════════════════════════════════════════════

  describe("pos-metrics", () => {
    let tracker: PosMetricsTracker

    beforeEach(() => {
      tracker = new PosMetricsTracker()
      vi.clearAllMocks()
    })

    it("PosMetricsTracker starts a ticket correctly", () => {
      const ticketId = "ticket-001"
      tracker.startTicket(ticketId)

      // We can't directly access metrics, but we can verify via completeTicket
      const completed = tracker.completeTicket(3, 12.50, "card")
      expect(completed).not.toBeNull()
      expect(completed?.ticketId).toBe(ticketId)
      expect(completed?.tapCount).toBe(0) // No taps yet
    })

    it("recordTap increments tap count", () => {
      tracker.startTicket("ticket-002")
      tracker.recordTap()
      tracker.recordTap()
      tracker.recordTap()

      const completed = tracker.completeTicket(2, 8.00, "card")
      expect(completed?.tapCount).toBe(3)
    })

    it("recordCombo sets comboUsed", () => {
      tracker.startTicket("ticket-003")
      tracker.recordCombo()

      const completed = tracker.completeTicket(2, 5.50, "cash")
      expect(completed?.comboUsed).toBe(true)
    })

    it("completeTicket returns correct metrics with duration", () => {
      tracker.startTicket("ticket-004")
      tracker.recordTap()
      tracker.recordTap()

      const completed = tracker.completeTicket(2, 10.00, "card")

      expect(completed).not.toBeNull()
      expect(completed?.ticketId).toBe("ticket-004")
      expect(completed?.itemCount).toBe(2)
      expect(completed?.total).toBe(10.00)
      expect(completed?.paymentMethod).toBe("card")
      expect(completed?.endTime).toBeDefined()
      expect(completed?.startTime).toBeDefined()

      // Verify duration is calculated
      const duration = (completed?.endTime || 0) - (completed?.startTime || 0)
      expect(duration).toBeGreaterThanOrEqual(0)
    })

    it("completeTicket logs to console", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {})

      tracker.startTicket("ticket-005")
      tracker.recordTap()
      tracker.recordUndo()
      tracker.completeTicket(3, 15.75, "card")

      expect(consoleSpy).toHaveBeenCalled()

      // Verify log contains expected fields
      const logCall = consoleSpy.mock.calls[0][0]
      expect(typeof logCall).toBe("string")

      const logData = JSON.parse(logCall)
      expect(logData.metric).toBe("pos.ticket_complete")
      expect(logData.ticketId).toBe("ticket-005")
      expect(logData.tapCount).toBe(1)
      expect(logData.undoCount).toBe(1)
      expect(logData.itemCount).toBe(3)
      expect(logData.total).toBe(15.75)
      expect(logData.paymentMethod).toBe("card")
      expect(logData.ts).toBeDefined()
      expect(logData.duration_ms).toBeGreaterThanOrEqual(0)

      consoleSpy.mockRestore()
    })

    it("multiple operations accumulate correctly", () => {
      tracker.startTicket("ticket-006")
      tracker.recordTap()
      tracker.recordTap()
      tracker.recordCombo()
      tracker.recordTap()
      tracker.recordUndo()

      const completed = tracker.completeTicket(4, 20.00, "cash")

      expect(completed?.tapCount).toBe(3)
      expect(completed?.undoCount).toBe(1)
      expect(completed?.comboUsed).toBe(true)
    })

    it("completeTicket returns null if no ticket was started", () => {
      const completed = tracker.completeTicket(0, 0, "card")
      expect(completed).toBeNull()
    })
  })
})
