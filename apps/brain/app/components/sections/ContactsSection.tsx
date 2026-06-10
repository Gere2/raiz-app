"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "firebase/auth"
import { authedFetch } from "../../../lib/authed-fetch"
import { Overlay, Fld, ErrorBanner } from "../ui"
import { T, page, pageTitle, pageSub, modalTitle, tableWrap, tbl, trHead, trBody, th, td, kpiBox, input, btnPrimary, btnSmall, btnGhost } from "../theme"

// ── Types ──────────────────────────────────────────────────────

type Contact = {
  id: string
  name: string
  phone?: string
  email?: string
  notes?: string
  createdAt?: { _seconds: number }
}

interface ContactsSectionProps {
  user: User
  orgId: string
}

// ── Create / edit modal ────────────────────────────────────────

function ContactModal({ user, orgId, contact, onClose, onSaved }: {
  user: User
  orgId: string
  contact: Contact | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(contact?.name || "")
  const [phone, setPhone] = useState(contact?.phone || "")
  const [email, setEmail] = useState(contact?.email || "")
  const [notes, setNotes] = useState(contact?.notes || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const save = async () => {
    if (!name.trim() || saving) return
    setSaving(true)
    setError("")
    try {
      const path = contact
        ? `/api/org/${orgId}/contacts/${contact.id}`
        : `/api/org/${orgId}/contacts`
      const res = await authedFetch(user, path, {
        method: contact ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email, notes }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al guardar")
      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
      setSaving(false)
    }
  }

  return (
    <Overlay onClose={onClose}>
      <h3 style={modalTitle}>{contact ? "Editar cliente" : "Nuevo cliente"}</h3>
      <Fld label="Nombre">
        <input style={{ ...input, width: "100%" }} value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del cliente" autoFocus />
      </Fld>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Fld label="Teléfono">
            <input style={{ ...input, width: "100%" }} value={phone} onChange={e => setPhone(e.target.value)} placeholder="Opcional" />
          </Fld>
        </div>
        <div style={{ flex: 1 }}>
          <Fld label="Email">
            <input style={{ ...input, width: "100%" }} value={email} onChange={e => setEmail(e.target.value)} placeholder="Opcional" />
          </Fld>
        </div>
      </div>
      <Fld label="Notas">
        <input style={{ ...input, width: "100%" }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opcional — p. ej. «viene cada mañana, cortado sin azúcar»" />
      </Fld>
      {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "8px 0 0" }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
        <button style={btnSmall} onClick={onClose}>Cancelar</button>
        <button style={{ ...btnPrimary, opacity: !name.trim() || saving ? 0.5 : 1 }} disabled={!name.trim() || saving} onClick={save}>
          {saving ? "Guardando…" : contact ? "Guardar cambios" : "Añadir cliente"}
        </button>
      </div>
    </Overlay>
  )
}

// ── Section ────────────────────────────────────────────────────

export default function ContactsSection({ user, orgId }: ContactsSectionProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<Contact | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchContacts = useCallback(async () => {
    try {
      setError("")
      const res = await authedFetch(user, `/api/org/${orgId}/contacts`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al cargar los clientes")
      setContacts(data.contacts || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar los clientes")
    } finally {
      setLoading(false)
    }
  }, [user, orgId])

  useEffect(() => { fetchContacts() }, [fetchContacts])

  const remove = async (c: Contact) => {
    if (busyId) return
    if (!window.confirm(`¿Eliminar a ${c.name} de tus clientes?`)) return
    setBusyId(c.id)
    try {
      const res = await authedFetch(user, `/api/org/${orgId}/contacts/${c.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al eliminar")
      await fetchContacts()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar")
    } finally {
      setBusyId(null)
    }
  }

  const q = search.trim().toLowerCase()
  const visible = q
    ? contacts.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q))
    : contacts

  return (
    <div style={page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div>
          <h2 style={pageTitle}>Clientes</h2>
          <p style={pageSub}>Tu agenda de habituales: quiénes son, cómo contactarles y qué les gusta.</p>
        </div>
        <button style={btnPrimary} onClick={() => setShowNew(true)}>+ Nuevo cliente</button>
      </div>

      {error && <ErrorBanner message={error} onRetry={fetchContacts} onDismiss={() => setError("")} />}

      {contacts.length > 0 && (
        <input
          style={{ ...input, width: "100%", maxWidth: 360, marginBottom: 16 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={`Buscar entre ${contacts.length} cliente${contacts.length === 1 ? "" : "s"}…`}
        />
      )}

      {loading ? (
        <p style={{ color: T.muted, fontSize: 14 }}>Cargando clientes…</p>
      ) : contacts.length === 0 ? (
        <div style={{ ...kpiBox, padding: "32px 24px", textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 600, color: T.text }}>Todavía no hay clientes</p>
          <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>Apunta a tus habituales para tener su contacto y sus preferencias a mano — y véndeles bonos.</p>
        </div>
      ) : visible.length === 0 ? (
        <p style={{ color: T.muted, fontSize: 14 }}>Sin resultados para «{search}».</p>
      ) : (
        <div style={tableWrap}>
          <table style={tbl}>
            <thead>
              <tr style={trHead}>
                <th style={{ ...th, textAlign: "left" }}>Nombre</th>
                <th style={{ ...th, textAlign: "left" }}>Teléfono</th>
                <th style={{ ...th, textAlign: "left" }}>Email</th>
                <th style={{ ...th, textAlign: "left" }}>Notas</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(c => {
                const busy = busyId === c.id
                return (
                  <tr key={c.id} style={trBody}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...td, fontSize: 13, color: T.muted }}>{c.phone || "—"}</td>
                    <td style={{ ...td, fontSize: 13, color: T.muted }}>{c.email || "—"}</td>
                    <td style={{ ...td, fontSize: 13, color: T.muted }}>{c.notes || "—"}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button style={{ ...btnSmall, marginRight: 6, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => setEditing(c)}>Editar</button>
                      <button style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => remove(c)} title="Eliminar cliente">✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <ContactModal user={user} orgId={orgId} contact={null} onClose={() => setShowNew(false)} onSaved={fetchContacts} />}
      {editing && <ContactModal user={user} orgId={orgId} contact={editing} onClose={() => setEditing(null)} onSaved={fetchContacts} />}
    </div>
  )
}
