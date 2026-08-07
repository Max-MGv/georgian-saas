'use client'

import { createContext, useContext } from 'react'

const AdminHintsContext = createContext(true)

export function AdminHintsProvider({ show, children }: { show: boolean; children: React.ReactNode }) {
  return <AdminHintsContext.Provider value={show}>{children}</AdminHintsContext.Provider>
}

export function useAdminHintsVisible() {
  return useContext(AdminHintsContext)
}
