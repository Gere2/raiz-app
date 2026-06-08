"use client"
import { RAIZ_ORG_ID } from "@/lib/tenant";

/**
 * Bono Supervivencia Exámenes — hook React.
 *
 * Centraliza el estado del bono para componentes:
 *   const ep = useExamPass()
 *   ep.state           // "loading" | "none" | "pending" | "active"
 *   ep.hasActivePass   // boolean
 *   ep.creditsAvailable
 *   ep.purchaseInit()
 *   ep.redeem({ productId: "cafe_solo" })
 *
 * Patrón: cargamos /quote y /me en paralelo al montar (y al refresh()).
 * Si tenemos passId, suscribimos `onSnapshot` al doc para reflejar
 * pending → active y cambios de créditos en vivo (las rules permiten
 * lectura propia).
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore"
import { onAuthStateChanged } from "firebase/auth"
import { auth, db } from "../firebase"
import {
  cancelPendingPurchase as svcCancelPending,
  fetchMe,
  fetchQuote,
  purchaseInit as svcPurchaseInit,
  redeem as svcRedeem,
  type CancelPendingData,
  type ExamPassClientError,
  type MeData,
  type PurchaseInitData,
  type QuoteData,
  type RedeemData,
  type Result,
} from "./client-service"
import { creditsAvailable as calcCreditsAvailable } from "./calc"
import type {
  ExamPass,
  ExamPassOrderInput,
  ExamPassRedemption,
} from "./types"

const DEFAULT_ORG = RAIZ_ORG_ID

export type ExamPassUiState = "loading" | "none" | "pending" | "active"

export interface UseExamPassResult {
  /** True mientras carga inicialmente o tras `refresh()`. */
  loading: boolean
  /** Último error de cualquier llamada (quote/me). null si todo OK. */
  error: ExamPassClientError | null

  /** Quote actual (siempre presente cuando loading === false y sin error). */
  quote: QuoteData | null

  /** Estado consumible por la UI. Combina /me con el snapshot del pass. */
  state: ExamPassUiState
  /** El pass activo o pending del usuario. null si state="none"/"loading". */
  pass: ExamPass | null

  // ── Computed ───────────────────────────────────────────────────
  hasActivePass: boolean
  hasPendingPass: boolean
  /** Créditos usables ahora: total − used − reserved. */
  creditsAvailable: number
  expiresAt: string | null
  /** True si tiene pass activo y créditos > 0. */
  canRedeem: boolean

  /**
   * Último canje consumido del usuario en este pass — para mostrar la
   * tarjeta "Repetir último pedido". Null si nunca ha pedido o si todavía
   * no se ha cargado.
   */
  lastRedemption: ExamPassRedemption | null

  // ── Acciones ───────────────────────────────────────────────────
  refresh: () => Promise<void>
  purchaseInit: () => Promise<Result<PurchaseInitData>>
  redeem: (input: ExamPassOrderInput) => Promise<Result<RedeemData>>
  /** Cancela el pass pending (cuando el usuario abandona el pago). */
  cancelPending: () => Promise<Result<CancelPendingData>>
}

// ── Cache local del estado /me ────────────────────────────────────
//
// Brain en cold start tarda 1-3 s; si está caído, `fetchMe` puede tardar
// hasta el timeout (6 s). Para que la home no quede bloqueada con un spinner,
// mostramos el último estado conocido del usuario INMEDIATAMENTE al montar
// el hook, y refrescamos en background. Si Brain falla, el cache aguanta.
//
// Clave por uid para evitar que un cambio de cuenta vea el bono del anterior.

const ME_CACHE_PREFIX = "raiz_exam_pass_me_v1__"
const QUOTE_CACHE_KEY = "raiz_exam_pass_quote_v1"

function meCacheKey(uid: string, orgId: string): string {
  return `${ME_CACHE_PREFIX}${uid}__${orgId}`
}

function readMeCache(uid: string | null, orgId: string): MeData | null {
  if (!uid || typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(meCacheKey(uid, orgId))
    if (!raw) return null
    return JSON.parse(raw) as MeData
  } catch {
    return null
  }
}

function writeMeCache(uid: string | null, orgId: string, data: MeData | null): void {
  if (!uid || typeof window === "undefined") return
  try {
    if (data) {
      window.localStorage.setItem(meCacheKey(uid, orgId), JSON.stringify(data))
    } else {
      window.localStorage.removeItem(meCacheKey(uid, orgId))
    }
  } catch {}
}

function readQuoteCache(): QuoteData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(QUOTE_CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as QuoteData
  } catch {
    return null
  }
}

function writeQuoteCache(data: QuoteData | null): void {
  if (typeof window === "undefined") return
  try {
    if (data) window.localStorage.setItem(QUOTE_CACHE_KEY, JSON.stringify(data))
    else window.localStorage.removeItem(QUOTE_CACHE_KEY)
  } catch {}
}

export function useExamPass(orgId: string = DEFAULT_ORG): UseExamPassResult {
  // Render optimista: si hay cache local, lo usamos como punto de partida.
  // Esto evita el spinner de la card en home cuando vuelves a abrir la app.
  const initialUid =
    typeof window !== "undefined" ? auth.currentUser?.uid ?? null : null
  const [me, setMe] = useState<MeData | null>(() => readMeCache(initialUid, orgId))
  const [quote, setQuote] = useState<QuoteData | null>(() => readQuoteCache())
  // Si arrancamos con cache, NO loading: la UI muestra ya algo razonable
  // mientras refrescamos en background.
  const [loading, setLoading] = useState(() => {
    return !readMeCache(initialUid, orgId) && !readQuoteCache()
  })
  const [error, setError] = useState<ExamPassClientError | null>(null)
  const [snapshotPass, setSnapshotPass] = useState<ExamPass | null>(null)
  const [hasAuth, setHasAuth] = useState<boolean>(() => !!auth.currentUser)
  const [lastRedemption, setLastRedemption] = useState<ExamPassRedemption | null>(null)

  // ── Refresh ────────────────────────────────────────────────────
  //
  // Intencionalmente robusto a fallos:
  //  - El quote es público; si falla, mantenemos el cache anterior.
  //  - `me` requiere sesión; si falla por timeout/network, mantenemos el
  //    cache local. Solo limpiamos cuando logout.
  //  - NUNCA dejamos `loading=true` si tenemos cache para mostrar.
  const refresh = useCallback(async () => {
    setError(null)
    const uid = auth.currentUser?.uid ?? null
    const hasInitialData =
      readMeCache(uid, orgId) !== null || readQuoteCache() !== null
    if (!hasInitialData) setLoading(true)

    const qr = await fetchQuote(orgId)
    if (qr.ok) {
      setQuote(qr.data)
      writeQuoteCache(qr.data)
    } else {
      // Mantener quote previo si lo había. Solo registrar el error.
      setError(qr.error)
    }

    if (!auth.currentUser) {
      // Anónimo: limpiar me en memoria; el cache por-uid ya separa cuentas.
      setMe(null)
      setLoading(false)
      return
    }

    const mr = await fetchMe(orgId)
    if (mr.ok) {
      setMe(mr.data)
      writeMeCache(uid, orgId, mr.data)
    } else {
      // Timeout / 502 / etc.: dejamos el cache que ya tenía la UI.
      setError(mr.error)
    }
    setLoading(false)
  }, [orgId])

  // Re-cargar cuando cambia auth (login/logout) o orgId.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const wasAuth = hasAuth
      setHasAuth(!!user)
      // Logout: limpiamos el `me` en memoria (el cache por-uid se queda
      // pero el siguiente login leerá su propio cache, no el del anterior).
      if (wasAuth && !user) setMe(null)
      // Tanto si entra como si sale, recargamos: anónimo ve solo quote,
      // logueado ve quote + me.
      void refresh()
    })
    // Carga inicial: hace fetch siempre, sin esperar al listener.
    void refresh()
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])

  // ── Realtime: snapshot del pass cuando lo tenemos ──────────────
  const passId = me && me.state !== "none" ? me.pass.id : null
  const lastPassIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!passId || !hasAuth) {
      setSnapshotPass(null)
      lastPassIdRef.current = null
      return
    }
    if (lastPassIdRef.current === passId) return
    lastPassIdRef.current = passId

    const ref = doc(db, "exam_passes", passId)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setSnapshotPass(null)
          return
        }
        const data = snap.data() as Omit<ExamPass, "id">
        setSnapshotPass({ ...data, id: snap.id })
      },
      (err) => {
        // El snapshot puede fallar por permisos justo después de logout;
        // es transitorio, lo absorbemos.
        console.warn("[useExamPass] snapshot error:", err)
      },
    )
    return () => unsub()
  }, [passId, hasAuth])

  // ── Última redemption consumida (para "Repetir último pedido") ─
  //
  // Solo cargamos cuando hay pass activo. La query usa where userId+orgId
  // y status="consumed", ordenado desc por consumedAt y limit(1). La regla
  // de Firestore permite al owner leer sus propias redemptions.
  //
  // Trigger: cambia passId (pass nuevo activo) o creditsUsed (acaba de
  // canjear). No es realtime — un getDocs basta porque el "último"
  // cambia poco.
  const lastRedemptionPassRef = useRef<string | null>(null)
  const me_creditsUsed = me?.state === "active" ? me.pass.creditsUsed : 0

  useEffect(() => {
    if (!passId || !hasAuth) {
      setLastRedemption(null)
      lastRedemptionPassRef.current = null
      return
    }
    let alive = true
    ;(async () => {
      try {
        const q = query(
          collection(db, "exam_pass_redemptions"),
          where("userId", "==", auth.currentUser?.uid ?? "__none__"),
          where("orgId", "==", orgId),
          where("status", "==", "consumed"),
          orderBy("consumedAt", "desc"),
          limit(1),
        )
        const snap = await getDocs(q)
        if (!alive) return
        if (snap.empty) {
          setLastRedemption(null)
        } else {
          const doc0 = snap.docs[0]
          setLastRedemption({ ...doc0.data(), id: doc0.id } as ExamPassRedemption)
        }
        lastRedemptionPassRef.current = passId
      } catch (err) {
        // Si falla (índice ausente, p.e.) no rompemos la card del bono.
        console.warn("[useExamPass] lastRedemption query failed:", err)
        if (alive) setLastRedemption(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [passId, hasAuth, orgId, me_creditsUsed])

  // ── Estado derivado ────────────────────────────────────────────

  // Pass "fresco": prioriza snapshot (siempre más actualizado) sobre /me.
  const pass: ExamPass | null =
    snapshotPass ?? (me && me.state !== "none" ? me.pass : null)

  let state: ExamPassUiState
  if (loading && !me) {
    state = "loading"
  } else if (pass) {
    if (pass.status === "active") state = "active"
    else if (pass.status === "pending") state = "pending"
    // expired / completed / canceled / refunded: para la UI, "no hay pass".
    else state = "none"
  } else {
    state = me ? me.state : "loading"
  }

  const hasActivePass = state === "active"
  const hasPendingPass = state === "pending"

  const creditsAvail = pass ? calcCreditsAvailable(pass) : 0

  const canRedeem = hasActivePass && creditsAvail > 0

  // ── Acciones ───────────────────────────────────────────────────

  const purchaseInit = useCallback(async () => {
    const result = await svcPurchaseInit(orgId)
    if (result.ok) {
      // Tras crear el pass pending: refresh para ver state="pending" + passId.
      void refresh()
    }
    return result
  }, [orgId, refresh])

  const redeem = useCallback(
    async (input: ExamPassOrderInput) => {
      const result = await svcRedeem(input, orgId)
      if (result.ok) {
        // creditsReserved ↑ (o creditsUsed ↑ si total=0). Snapshot lo refleja
        // automáticamente.
        void refresh()
      }
      return result
    },
    [orgId, refresh],
  )

  const cancelPending = useCallback(async () => {
    const result = await svcCancelPending(orgId)
    if (result.ok) {
      // Reset local: el pass que estábamos escuchando ya no está pending.
      // Limpiamos también el cache para que el siguiente refresh no muestre
      // brevemente el pending viejo antes de la nueva respuesta.
      setSnapshotPass(null)
      const uid = auth.currentUser?.uid ?? null
      writeMeCache(uid, orgId, null)
      void refresh()
    }
    return result
  }, [orgId, refresh])

  return {
    loading,
    error,
    quote,
    state,
    pass,
    hasActivePass,
    hasPendingPass,
    creditsAvailable: creditsAvail,
    expiresAt: pass?.expiresAt ?? null,
    canRedeem,
    lastRedemption,
    refresh,
    purchaseInit,
    redeem,
    cancelPending,
  }
}
