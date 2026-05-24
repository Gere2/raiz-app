/**
 * types/staff.ts — Usuarios internos
 */

export type StaffRole = "owner" | "admin" | "manager" | "barista" | "vendedor"

export interface StaffMember {
  id: string
  uid?: string
  name: string
  email?: string
  role: StaffRole
  pin?: string
  active: boolean
  createdAt?: unknown
  updatedAt?: unknown
}
