'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { deleteTenant } from '@/app/actions/superAdmin'
import { useRouter } from 'next/navigation'

type Tenant = {
  id: string
  name: string
  domain: string
  slug: string
  createdAt: string
  primaryColor: string
  primaryHover: string
  orderCount: number
  companyCount: number
}

const C = {
  card: '#111827',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#475569',
}

export default function TenantsClient({ tenants: initial }: { tenants: Tenant[] }) {
  const [tenants, setTenants] = useState(initial)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleDeleteClick(id: string) {
    setConfirmId(id)
    setError(null)
  }

  function handleDeleteConfirm(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      try {
        await deleteTenant(id)
        setTenants(t => t.filter(x => x.id !== id))
        setConfirmId(null)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Delete failed')
        setConfirmId(null)
      } finally {
        setDeletingId(null)
      }
    })
  }

  if (tenants.length === 0) {
    return (
      <div style={{
        padding: '60px 24px', textAlign: 'center',
        backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🏢</div>
        <p style={{ color: C.muted, marginBottom: 20 }}>No tenants yet.</p>
        <Link href="/super-admin/tenants/new" style={{
          display: 'inline-block', padding: '10px 24px', borderRadius: 8,
          backgroundColor: '#6366f1', color: '#fff', fontSize: 14,
        }}>
          Add your first tenant
        </Link>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div style={{
          marginBottom: 16, padding: '12px 16px', borderRadius: 8,
          backgroundColor: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5',
          fontSize: 14,
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, color: '#fca5a5', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tenants.map(t => (
          <div key={t.id} style={{
            backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
            padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 16,
          }}>
            {/* Color swatch */}
            <div style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              backgroundColor: t.primaryColor,
              border: '2px solid rgba(255,255,255,0.1)',
              boxShadow: `0 0 12px ${t.primaryColor}66`,
            }} />

            {/* Name + domain */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-medium" style={{ color: C.text, fontSize: 15 }}>{t.name}</div>
              <div style={{ color: C.faint, fontSize: 13, marginTop: 2 }}>{t.domain}</div>
            </div>

            {/* Slug */}
            <div style={{
              padding: '3px 10px', borderRadius: 6,
              backgroundColor: '#1e293b', border: '1px solid #334155',
              color: C.muted, fontSize: 12, fontFamily: 'monospace', flexShrink: 0,
            }}>
              {t.slug}
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: C.text, fontSize: 16, fontWeight: 600 }}>{t.orderCount}</div>
                <div style={{ color: C.faint, fontSize: 11 }}>orders</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: C.text, fontSize: 16, fontWeight: 600 }}>{t.companyCount}</div>
                <div style={{ color: C.faint, fontSize: 11 }}>companies</div>
              </div>
            </div>

            {/* Created */}
            <div style={{ color: C.faint, fontSize: 12, flexShrink: 0 }}>
              {new Date(t.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>

            {/* Actions */}
            {confirmId === t.id ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: '#f87171' }}>Delete?</span>
                <button
                  onClick={() => handleDeleteConfirm(t.id)}
                  disabled={deletingId === t.id}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    backgroundColor: '#7f1d1d', border: '1px solid #991b1b', color: '#fca5a5',
                  }}
                >
                  {deletingId === t.id ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Link
                  href={`/super-admin/tenants/${t.id}`}
                  style={{
                    padding: '6px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                    backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
                    textDecoration: 'none', display: 'inline-block',
                  }}
                >
                  Edit
                </Link>
                {t.orderCount === 0 && t.companyCount === 0 && (
                  <button
                    onClick={() => handleDeleteClick(t.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                      backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f87171',
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
