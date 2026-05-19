'use client'

import Link from 'next/link'
import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { isAddress } from 'viem'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { useAdmin } from '@/contexts/AdminContext'
import { toastError } from '@/lib/toast'

export default function BlacklistAdminPage() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { isAdmin, withSession } = useAdmin()

  const [addresses, setAddresses] = useState<string[]>([])
  const [newAddress, setNewAddress] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await withSession(async () => {
      const res = await fetch('/api/admin/blacklist')
      if (!res.ok) return [] as string[]
      const d = (await res.json()) as { addresses?: string[] }
      return Array.isArray(d.addresses) ? d.addresses : []
    })
    setAddresses(result ?? [])
    setLoading(false)
  }, [withSession])

  useEffect(() => {
    if (isAdmin) void refresh()
  }, [isAdmin, refresh])

  async function handleAdd() {
    if (!isAddress(newAddress)) {
      toast.error('Invalid address')
      return
    }
    setBusy(true)
    try {
      const ok = await withSession(async () => {
        const res = await fetch('/api/admin/blacklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: newAddress }),
        })
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
        if (!res.ok || !json.ok) throw new Error(json.error ?? 'Add failed')
        return true
      })
      if (!ok) return
      toast.success('Address blocked')
      setNewAddress('')
      await refresh()
    } catch (err) {
      toastError('Add', err)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(addr: string) {
    try {
      const ok = await withSession(async () => {
        const res = await fetch('/api/admin/blacklist', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: addr }),
        })
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
        if (!res.ok || !json.ok) throw new Error(json.error ?? 'Remove failed')
        return true
      })
      if (!ok) return
      toast.success('Address unblocked')
      await refresh()
    } catch (err) {
      toastError('Unblock', err)
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 flex flex-col items-center gap-4 text-center">
        <h1 className="text-ink font-mono text-lg">Blacklist</h1>
        <p className="text-dim font-mono text-xs">connect with the admin wallet to continue</p>
        <button onClick={() => openConnectModal?.()} className="px-4 py-2 text-xs font-mono uppercase tracking-widest btn-accent">
          connect wallet
        </button>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 flex flex-col gap-4 items-center text-center">
        <ShieldAlert size={20} className="text-accent" />
        <h1 className="text-ink font-mono text-lg">Not authorized</h1>
        <p className="text-dim font-mono text-xs">Switch to the admin wallet and refresh.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-12 flex flex-col gap-6">
      {address && (
        <Link href="/admin" className="text-[10px] font-mono text-muted hover:text-dim flex items-center gap-1.5 w-fit uppercase tracking-wider">
          <ArrowLeft size={11} />
          back to admin
        </Link>
      )}

      <div>
        <h1 className="text-ink font-mono text-lg mb-2">Blacklist</h1>
        <p className="text-dim font-mono text-xs leading-relaxed">
          Platform-wide address ban. Blocks the address from minting and
          (where wired) hides their content from public feeds. Distinct from
          per-content hiding (creators control that themselves).
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newAddress}
          onChange={(e) => setNewAddress(e.target.value.trim())}
          placeholder="0x…"
          className="flex-1 bg-[#0a0a0a] border border-line px-3 py-2.5 text-sm text-ink font-mono placeholder-[#444] focus:outline-none focus:border-muted"
        />
        <button onClick={handleAdd} disabled={busy} className="px-4 text-xs font-mono uppercase tracking-widest btn-accent disabled:opacity-50">
          block
        </button>
      </div>

      <div>
        <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted mb-2">
          blocked addresses ({addresses.length})
        </h2>
        {loading ? (
          <p className="text-xs font-mono text-muted">loading…</p>
        ) : addresses.length === 0 ? (
          <p className="text-xs font-mono text-muted">none</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {addresses.map((addr) => (
              <li key={addr} className="flex items-center justify-between border border-line px-3 py-2">
                <span className="text-xs font-mono text-ink truncate">{addr}</span>
                <button onClick={() => handleRemove(addr)} className="text-[10px] font-mono uppercase tracking-widest text-muted hover:text-ink">
                  unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
