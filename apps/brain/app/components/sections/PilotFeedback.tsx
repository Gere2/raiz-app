"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { authedFetch } from "@/lib/authed-fetch";

/**
 * Feedback mínimo del piloto — se monta tras ver la cafetería demo y en la
 * ruta guiada cuando el usuario ya avanzó. Una respuesta cerrada (4 opciones)
 * + texto corto opcional. POST org-scoped a /api/org/[orgId]/feedback (el
 * servidor sanea y valida allowlist). localStorage evita re-preguntar en el
 * mismo navegador una vez enviado (no es una cookie ni viaja a ningún lado).
 */

const CHOICES = [
  { key: "lo_entiendo", label: "Lo entiendo" },
  { key: "me_interesa", label: "Me interesa" },
  { key: "no_se_que_hacer", label: "No sé qué hacer" },
  { key: "quiero_ayuda", label: "Quiero que me ayudéis" },
] as const;

type ChoiceKey = (typeof CHOICES)[number]["key"];

type Props = {
  user: User;
  orgId: string;
  surface: "demo" | "onboarding";
};

const storageKey = (orgId: string) => `enverde_pilot_feedback_${orgId}`;

export default function PilotFeedback({ user, orgId, surface }: Props) {
  const [choice, setChoice] = useState<ChoiceKey | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [alreadyAnswered] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(storageKey(orgId)) === "1";
    } catch {
      return false;
    }
  });

  if (alreadyAnswered) return null;

  if (sent) {
    return (
      <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--t-border)", background: "var(--t-bg)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--t-text)" }}>
          Gracias. Tu respuesta decide qué construimos después.
        </p>
      </div>
    );
  }

  const send = async () => {
    if (!choice || sending) return;
    setSending(true);
    try {
      const r = await authedFetch(user, `/api/org/${orgId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, message: message.trim() || undefined, surface }),
      });
      if (r.ok) {
        try {
          window.localStorage.setItem(storageKey(orgId), "1");
        } catch {
          // sin storage seguimos: solo perdería la marca de "ya respondido"
        }
        setSent(true);
      }
    } catch (e) {
      console.error("Pilot feedback:", e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--t-border)", background: "var(--t-bg)" }}>
      <p className="text-sm font-bold" style={{ color: "var(--t-text)" }}>
        {surface === "demo" ? "¿Qué te ha parecido la demo?" : "¿Cómo lo ves hasta ahora?"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHOICES.map((c) => {
          const active = choice === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setChoice(c.key)}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold transition"
              style={
                active
                  ? { background: "var(--t-accent)", borderColor: "var(--t-accent)", color: "#fff" }
                  : { background: "transparent", borderColor: "var(--t-border)", color: "var(--t-muted)", cursor: "pointer" }
              }
            >
              {c.label}
            </button>
          );
        })}
      </div>
      {choice && (
        <div className="mt-3">
          <label className="block text-xs font-medium" style={{ color: "var(--t-dim)" }} htmlFor={`pilot-feedback-${surface}`}>
            ¿Algo más que quieras contarnos? (opcional)
          </label>
          <textarea
            id={`pilot-feedback-${surface}`}
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 240))}
            rows={2}
            maxLength={240}
            className="mt-1.5 w-full rounded-lg border p-2 text-sm"
            style={{ borderColor: "var(--t-border)", background: "var(--t-surface)", color: "var(--t-text)" }}
          />
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="mt-2 rounded-lg px-4 py-2 text-sm font-bold"
            style={{ background: "var(--t-accent)", color: "#fff", cursor: sending ? "default" : "pointer", opacity: sending ? 0.7 : 1, border: "none" }}
          >
            {sending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      )}
    </div>
  );
}
