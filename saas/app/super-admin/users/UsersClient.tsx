'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  setUserTenant, setUserSuperAdmin, removeUserAdminRole, createAdminUser,
} from '@/app/actions/superAdmin'

type User = {
  id: string
  email: string
  role: string | null
  tenantId: string | null
  createdAt: string
  lastSignIn: string | null
}

type Tenant = { id: string; name: string }

type Props = {
  users: User[]
  tenants: Tenant[]
  currentUserId: string
}

const C = {
  card: '#111827',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#475569',
  inputBg: '#0b1120',
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, backgroundColor: C.inputBg,
  color: C.text, fontSize: 13, outline: 'none', boxSizing: 'border-box',
}

function RoleBadge({ user, tenants }: { user: User; tenants: Tenant[] }) {
  if (user.role === 'super_admin') {
    return (
      <span style={{
        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        backgroundColor: '#1e1b4b', color: '#a5b4fc', border: '1px solid #3730a3',
      }}>
        super_admin
      </span>
    )
  }
  if (user.tenantId) {
    const tenant = tenants.find(t => t.id === user.tenantId)
    return (
      <span style={{
        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
        backgroundColor: '#052e16', color: '#86efac', border: '1px solid #166534',
      }}>
        {tenant?.name ?? user.tenantId.slice(0, 8)}
      </span>
    )
  }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: 11,
      backgroundColor: '#1e293b', color: C.faint, border: `1px solid ${C.border}`,
    }}>
      no access
    </span>
  )
}

function UserRow({ user, tenants, currentUserId, onRefresh }: {
  user: User; tenants: Tenant[]; currentUserId: string
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [mode, setMode] = useState<'tenant' | 'super'>('tenant')
  const [selectedTenantId, setSelectedTenantId] = useState(user.tenantId ?? '')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const isMe = user.id === currentUserId

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        if (mode === 'super') {
          await setUserSuperAdmin(user.id)
        } else {
          if (!selectedTenantId) { setError('Select a tenant'); return }
          await setUserTenant(user.id, selectedTenantId)
        }
        setEditing(false)
        onRefresh()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed')
      }
    })
  }

  function removeAccess() {
    startTransition(async () => {
      try {
        await removeUserAdminRole(user.id)
        setConfirmingRemove(false)
        onRefresh()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed')
        setConfirmingRemove(false)
      }
    })
  }

  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
      padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {/* Avatar initial */}
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          backgroundColor: '#1e293b', border: '1px solid #334155',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.muted, fontSize: 14, fontWeight: 600,
        }}>
          {user.email[0].toUpperCase()}
        </div>

        {/* Email + dates */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ color: C.text, fontSize: 14 }}>
            {user.email}
            {isMe && <span style={{ marginLeft: 8, fontSize: 11, color: '#818cf8' }}>(you)</span>}
          </div>
          <div style={{ color: C.faint, fontSize: 11, marginTop: 2 }}>
            joined {new Date(user.createdAt).toLocaleDateString('en-GB')}
            {user.lastSignIn && ` · last seen ${new Date(user.lastSignIn).toLocaleDateString('en-GB')}`}
          </div>
        </div>

        {/* Role badge */}
        <RoleBadge user={user} tenants={tenants} />

        {/* Actions */}
        {!isMe && !editing && confirmingRemove && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#f87171' }}>Remove access?</span>
            <button
              onClick={removeAccess}
              disabled={isPending}
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                backgroundColor: '#7f1d1d', border: '1px solid #991b1b', color: '#fca5a5',
              }}
            >
              {isPending ? 'Removing…' : 'Yes, remove'}
            </button>
            <button
              onClick={() => setConfirmingRemove(false)}
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
              }}
            >
              Cancel
            </button>
          </div>
        )}
        {!isMe && !editing && !confirmingRemove && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
              }}
            >
              Change role
            </button>
            {(user.role || user.tenantId) && (
              <button
                onClick={() => setConfirmingRemove(true)}
                style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  backgroundColor: '#1e293b', border: '1px solid #334155', color: '#f87171',
                }}
              >
                Remove access
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['tenant', 'super'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  backgroundColor: mode === m ? '#312e81' : '#1e293b',
                  border: `1px solid ${mode === m ? '#4338ca' : '#334155'}`,
                  color: mode === m ? '#a5b4fc' : C.muted,
                }}
              >
                {m === 'tenant' ? 'Assign to tenant' : 'Make super admin'}
              </button>
            ))}
          </div>

          {mode === 'tenant' && (
            <select
              value={selectedTenantId}
              onChange={e => setSelectedTenantId(e.target.value)}
              style={{ ...inputStyle, marginBottom: 10 }}
            >
              <option value="">Select tenant…</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}

          {mode === 'super' && (
            <p style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10, padding: '8px 12px', backgroundColor: '#451a03', borderRadius: 6 }}>
              This will give full platform access. Use only for your own accounts.
            </p>
          )}

          {error && <p style={{ fontSize: 12, color: '#f87171', marginBottom: 8 }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={save}
              disabled={isPending}
              style={{
                padding: '7px 18px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                backgroundColor: '#6366f1', color: '#fff', border: 'none',
                opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setError(null) }}
              style={{
                padding: '7px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer',
                backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function NewUserForm({ tenants, onDone }: { tenants: Tenant[]; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'tenant' | 'super'>('tenant')
  const [tenantId, setTenantId] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email || !password) { setError('Email and password are required'); return }
    if (mode === 'tenant' && !tenantId) { setError('Select a tenant'); return }

    startTransition(async () => {
      try {
        await createAdminUser({ email, password, mode, tenantId: mode === 'tenant' ? tenantId : undefined })
        onDone()
        router.refresh()
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to create user')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{
      backgroundColor: C.card, border: `1px solid #334155`, borderRadius: 12,
      padding: 20, marginBottom: 16,
    }}>
      <h3 style={{ color: C.text, fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Create Admin User</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@winery.ge" style={inputStyle} required />
        </div>
        <div>
          <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Minimum 8 characters" style={inputStyle} required />
        </div>

        <div>
          <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 8 }}>Access level</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['tenant', 'super'] as const).map(m => (
              <button
                key={m} type="button" onClick={() => setMode(m)}
                style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  backgroundColor: mode === m ? '#312e81' : '#1e293b',
                  border: `1px solid ${mode === m ? '#4338ca' : '#334155'}`,
                  color: mode === m ? '#a5b4fc' : C.muted,
                }}
              >
                {m === 'tenant' ? 'Tenant admin' : 'Super admin'}
              </button>
            ))}
          </div>
        </div>

        {mode === 'tenant' && (
          <div>
            <label style={{ fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }}>Tenant</label>
            <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={inputStyle}>
              <option value="">Select tenant…</option>
              {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}

        {error && <p style={{ fontSize: 12, color: '#f87171' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="submit" disabled={isPending}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              backgroundColor: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Creating…' : 'Create User'}
          </button>
          <button
            type="button" onClick={onDone}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
              backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  )
}

export default function UsersClient({ users: initial, tenants, currentUserId }: Props) {
  const [users, setUsers] = useState(initial)
  const [showNewForm, setShowNewForm] = useState(false)
  const router = useRouter()

  function refresh() { router.refresh() }

  return (
    <div>
      {!showNewForm ? (
        <button
          onClick={() => setShowNewForm(true)}
          style={{
            marginBottom: 16, padding: '8px 18px', borderRadius: 8, fontSize: 13,
            fontWeight: 500, backgroundColor: '#6366f1', color: '#fff',
            border: 'none', cursor: 'pointer',
          }}
        >
          + New Admin User
        </button>
      ) : (
        <NewUserForm tenants={tenants} onDone={() => { setShowNewForm(false); refresh() }} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => (
          <UserRow
            key={u.id}
            user={u}
            tenants={tenants}
            currentUserId={currentUserId}
            onRefresh={refresh}
          />
        ))}
      </div>
    </div>
  )
}
