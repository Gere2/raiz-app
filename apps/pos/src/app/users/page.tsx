"use client"

import { useEffect, useState } from "react"
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { AuthenticatedLayout } from "@/components/authenticated-layout"
import { RoleGuard } from "@/components/role-guard"
import { UserPlus, Edit2, Trash2, Shield, Coffee, X, Check } from "lucide-react"

type PosUser = {
  id: string
  name: string
  pin: string
  role: "admin" | "vendedor"
  active: boolean
  createdAt?: any
}

export default function UsersPage() {
  return (
    <RoleGuard allowedRoles={["admin"]} fallbackRoute="/pos">
      <UsersContent />
    </RoleGuard>
  )
}

function UsersContent() {
  const [users, setUsers] = useState<PosUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<PosUser | null>(null)
  const [formData, setFormData] = useState({ name: "", pin: "", role: "vendedor" as "admin" | "vendedor" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const fetchUsers = async () => {
    try {
      const snap = await getDocs(collection(db, "cafe_users"))
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PosUser[]
      setUsers(list.sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err) {
      console.error("Error loading users:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  const resetForm = () => {
    setFormData({ name: "", pin: "", role: "vendedor" })
    setEditing(null)
    setShowForm(false)
    setError(null)
  }

  const startEdit = (user: PosUser) => {
    setEditing(user)
    setFormData({ name: user.name, pin: user.pin, role: user.role })
    setShowForm(true)
    setError(null)
  }

  const handleSave = async () => {
    if (!formData.name.trim()) { setError("El nombre es obligatorio"); return }
    if (!formData.pin.trim() || formData.pin.length < 4) { setError("El PIN debe tener al menos 4 dígitos"); return }
    if (!/^\d+$/.test(formData.pin)) { setError("El PIN solo puede contener números"); return }

    // Check duplicates
    const dup = users.find((u) => u.pin === formData.pin && u.id !== editing?.id)
    if (dup) { setError(`El PIN ya está en uso por ${dup.name}`); return }

    const dupName = users.find((u) => u.name.toLowerCase() === formData.name.trim().toLowerCase() && u.id !== editing?.id)
    if (dupName) { setError("Ya existe un usuario con ese nombre"); return }

    setSaving(true)
    setError(null)
    try {
      if (editing) {
        await updateDoc(doc(db, "cafe_users", editing.id), {
          name: formData.name.trim(),
          pin: formData.pin,
          role: formData.role,
          updatedAt: serverTimestamp(),
        })
      } else {
        await addDoc(collection(db, "cafe_users"), {
          name: formData.name.trim(),
          pin: formData.pin,
          role: formData.role,
          active: true,
          createdAt: serverTimestamp(),
        })
      }
      await fetchUsers()
      resetForm()
    } catch (err: any) {
      setError(err.message || "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (userId: string) => {
    try {
      await deleteDoc(doc(db, "cafe_users", userId))
      await fetchUsers()
      setDeleteConfirm(null)
    } catch (err: any) {
      console.error("Error deleting:", err)
    }
  }

  const toggleActive = async (user: PosUser) => {
    try {
      await updateDoc(doc(db, "cafe_users", user.id), { active: !user.active })
      await fetchUsers()
    } catch (err) {
      console.error("Error:", err)
    }
  }

  const admins = users.filter((u) => u.role === "admin")
  const vendors = users.filter((u) => u.role === "vendedor")

  return (
    <AuthenticatedLayout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de usuarios</h1>
            <p className="text-sm text-gray-500">{users.length} usuario{users.length !== 1 ? "s" : ""} registrado{users.length !== 1 ? "s" : ""}</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true) }}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Nuevo usuario
          </button>
        </div>

        {/* Form modal */}
        {showForm && (
          <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {editing ? "Editar usuario" : "Nuevo usuario"}
              </h2>
              <button onClick={resetForm} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Nombre del empleado"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN de acceso</label>
                <input
                  value={formData.pin}
                  onChange={(e) => setFormData((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "") }))}
                  placeholder="Mínimo 4 dígitos"
                  maxLength={8}
                  inputMode="numeric"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, role: "vendedor" }))}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium border-2 transition-all ${
                      formData.role === "vendedor"
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <Coffee className="h-4 w-4" />
                    Vendedor
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((p) => ({ ...p, role: "admin" }))}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium border-2 transition-all ${
                      formData.role === "admin"
                        ? "border-amber-500 bg-amber-50 text-amber-700"
                        : "border-gray-200 bg-white text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {formData.role === "admin"
                    ? "👑 Acceso completo: Dashboard, productos, usuarios, reportes"
                    : "🧑‍💼 Solo acceso al punto de venta y pedidos"}
                </p>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={resetForm} className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? (
                  <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />Guardando...</>
                ) : (
                  <><Check className="h-4 w-4" />{editing ? "Guardar cambios" : "Crear usuario"}</>
                )}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Admins */}
            {admins.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Administradores</p>
                </div>
                <div className="space-y-2">
                  {admins.map((user) => (
                    <UserCard key={user.id} user={user} onEdit={startEdit} onDelete={() => setDeleteConfirm(user.id)} onToggle={toggleActive} deleteConfirm={deleteConfirm} confirmDelete={handleDelete} cancelDelete={() => setDeleteConfirm(null)} />
                  ))}
                </div>
              </div>
            )}

            {/* Vendors */}
            {vendors.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Coffee className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Vendedores</p>
                </div>
                <div className="space-y-2">
                  {vendors.map((user) => (
                    <UserCard key={user.id} user={user} onEdit={startEdit} onDelete={() => setDeleteConfirm(user.id)} onToggle={toggleActive} deleteConfirm={deleteConfirm} confirmDelete={handleDelete} cancelDelete={() => setDeleteConfirm(null)} />
                  ))}
                </div>
              </div>
            )}

            {users.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-4xl mb-3">👥</p>
                <p className="text-gray-500">No hay usuarios. Crea el primero.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  )
}

function UserCard({ user, onEdit, onDelete, onToggle, deleteConfirm, confirmDelete, cancelDelete }: {
  user: PosUser; onEdit: (u: PosUser) => void; onDelete: () => void; onToggle: (u: PosUser) => void
  deleteConfirm: string | null; confirmDelete: (id: string) => void; cancelDelete: () => void
}) {
  const isDeleting = deleteConfirm === user.id

  return (
    <div className={`rounded-xl border bg-white p-4 transition-all ${user.active ? "border-gray-200" : "border-gray-200 opacity-60"}`}>
      {isDeleting ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-red-600 font-medium">¿Eliminar a {user.name}?</p>
          <div className="flex gap-2">
            <button onClick={cancelDelete} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100">No</button>
            <button onClick={() => confirmDelete(user.id)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700">Sí, eliminar</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold ${
            user.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
          }`}>
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-900 truncate">{user.name}</p>
              {!user.active && <span className="text-[10px] font-medium bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">Inactivo</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              <span className={`text-xs font-medium ${user.role === "admin" ? "text-amber-600" : "text-blue-600"}`}>
                {user.role === "admin" ? "👑 Admin" : "🧑‍💼 Vendedor"}
              </span>
              <span className="text-xs text-gray-400 font-mono">PIN: {user.pin}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => onToggle(user)} className={`rounded-lg p-2 text-xs transition-colors ${user.active ? "text-green-600 hover:bg-green-50" : "text-gray-400 hover:bg-gray-100"}`} title={user.active ? "Desactivar" : "Activar"}>
              {user.active ? "✅" : "⏸️"}
            </button>
            <button onClick={() => onEdit(user)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors">
              <Edit2 className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
