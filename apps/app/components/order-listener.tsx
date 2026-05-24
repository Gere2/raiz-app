"use client"

import { useOrderNotifications } from "@/hooks/use-order-notifications"

/**
 * Invisible component that runs the order notification listener.
 * Must be a client component since the hook uses useEffect.
 */
export function OrderListener() {
  useOrderNotifications()
  return null
}
