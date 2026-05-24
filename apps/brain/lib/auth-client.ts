"use client";

import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

let signingIn = false;

/**
 * Google sign-in: popup primero, redirect como fallback
 * (popup suele fallar en iOS Safari)
 */
export async function signInWithGoogle() {
  if (signingIn) return;
  signingIn = true;

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    await signInWithPopup(auth, provider);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    // Si popup está bloqueado → redirect
    if (
      code === "auth/popup-blocked" ||
      code === "auth/popup-closed-by-user"
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    // cancelled-popup-request no es error real
    if (code !== "auth/cancelled-popup-request") {
      console.error("Login error:", e);
    }
  } finally {
    signingIn = false;
  }
}

/**
 * Consume redirect result (llamar una vez al montar la app)
 */
export async function consumeRedirectResult() {
  try {
    await getRedirectResult(auth);
  } catch {
    // Sin redirect pendiente → ok
  }
}

export async function logout() {
  signingIn = false;
  await signOut(auth);
}
