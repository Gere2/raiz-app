"use client"
import { useEffect, useRef, useCallback } from "react"; import { collection, onSnapshot, query, where } from "firebase/firestore"; import { db } from "@/lib/firebase"; import { useAuth } from "@/components/auth-provider"
type OrderDoc = { status?: string; items?: { productName: string; qty: number }[] }

function playReadySound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    ;[{ freq: 523, start: 0, dur: 0.15 }, { freq: 659, start: 0.15, dur: 0.15 }, { freq: 784, start: 0.30, dur: 0.15 }, { freq: 1047, start: 0.45, dur: 0.30 }].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.type = "sine"; osc.frequency.setValueAtTime(freq, ctx.currentTime + start); gain.gain.setValueAtTime(0.25, ctx.currentTime + start); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur); osc.start(ctx.currentTime + start); osc.stop(ctx.currentTime + start + dur) })
  } catch (err) {
    console.warn("[Audio] Failed to play sound:", err)
  }
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return
  try { new Notification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: "order-ready", ...({ renotify: true, vibrate: [200, 100, 200] } as any) }) } catch {} }

export function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return Promise.resolve(false)
  if (Notification.permission === "granted") return Promise.resolve(true); if (Notification.permission === "denied") return Promise.resolve(false)
  return Notification.requestPermission().then((p) => p === "granted") }

export function useOrderNotifications() {
  const { user } = useAuth()
  const prevStatusMap = useRef<Map<string, string>>(new Map())
  const isFirstLoad = useRef(true)
  const isMounted = useRef(true)

  const notifyReady = useCallback((orderId: string, order: OrderDoc) => {
    const itemsSummary = order.items?.map((i) => `${i.qty}× ${i.productName}`).join(", ") || "Your order"
    playReadySound()
    sendBrowserNotification("🔔 Your order is ready!", `Pick it up at the bar: ${itemsSummary}`)
  }, [])

  useEffect(() => {
    if (!user) return

    isMounted.current = true
    const q = query(collection(db, "orders"), where("customerUid", "==", user.uid))

    const unsub = onSnapshot(
      q,
      (snap) => {
        // SECURITY: Only update state if component is still mounted
        if (!isMounted.current) return

        const newMap = new Map<string, string>()

        snap.docs.forEach((doc) => {
          const data = doc.data() as OrderDoc
          const status = data.status || ""
          newMap.set(doc.id, status)

          if (!isFirstLoad.current) {
            const prevStatus = prevStatusMap.current.get(doc.id)
            if (prevStatus && prevStatus !== "READY" && status === "READY") {
              notifyReady(doc.id, data)
            }
          }
        })

        isFirstLoad.current = false
        prevStatusMap.current = newMap
      },
      (error) => {
        console.error("[OrderNotifications] Listener error:", error)
      }
    )

    // Cleanup: unsubscribe and mark as unmounted
    return () => {
      isMounted.current = false
      unsub()
    }
  }, [user, notifyReady])
}
