'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { toast } from 'sonner'
import { Pencil } from 'lucide-react'
import { ProfileAvatar } from './ProfileAvatar'
import { MomentCard } from './MomentCard'
import { MarketCard } from './MarketCard'
import type { Listing } from '@/lib/listings'
import type { Moment } from '@/lib/inprocess'

interface ProfileViewProps {
  address: string
}

interface Profile {
  address: string
  username?: string
  avatarUrl?: string
  updatedAt: number
}

export function ProfileView({ address }: ProfileViewProps) {
  const { address: connectedAddress } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { signMessageAsync } = useSignMessage()

  const isOwner = connectedAddress?.toLowerCase() === address.toLowerCase()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadingMoments, setLoadingMoments] = useState(true)
  const [loadingListings, setLoadingListings] = useState(true)
  const [editing, setEditing] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [avatarInput, setAvatarInput] = useState('')
  const [saving, setSaving] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/profile/${address}`)
      .then((r) => r.json())
      .then((d) => setProfile(d.profile ?? { address, updatedAt: 0 }))
      .catch(() => setProfile({ address, updatedAt: 0 }))
      .finally(() => setLoadingProfile(false))
  }, [address])

  useEffect(() => {
    fetch(`/api/timeline?creator=${address}&limit=50`)
      .then((r) => r.json())
      .then((d) => setMoments(Array.isArray(d.moments) ? d.moments : []))
      .catch(() => setMoments([]))
      .finally(() => setLoadingMoments(false))
  }, [address])

  useEffect(() => {
    fetch(`/api/listings?seller=${address}&limit=50`)
      .then((r) => r.json())
      .then((d) => setListings(Array.isArray(d.listings) ? d.listings.filter((l: Listing) => l.status === 'active') : []))
      .catch(() => setListings([]))
      .finally(() => setLoadingListings(false))
  }, [address])

  function openEdit() {
    setUsernameInput(profile?.username ?? '')
    setAvatarInput(profile?.avatarUrl ?? '')
    setEditing(true)
  }

  async function saveProfile() {
    if (!isOwner) return
    if (!connectedAddress) { openConnectModal?.(); return }

    setSaving(true)
    try {
      const nonceRes = await fetch(`/api/profile/${address}/nonce`)
      const { nonce } = await nonceRes.json()

      const message = `Update Kismet Art profile\nAddress: ${address.toLowerCase()}\nNonce: ${nonce}`
      const signature = await signMessageAsync({ message })

      const res = await fetch(`/api/profile/${address}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim() || undefined,
          avatarUrl: avatarInput.trim() || undefined,
          signature,
          nonce,
        }),
      })

      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save')
      }

      const { profile: updated } = await res.json()
      setProfile(updated)
      setEditing(false)
      toast.success('Profile updated')
    } catch (err) {
      toast.error('Failed to update profile', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSaving(false)
    }
  }

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`
  const displayName = profile?.username || shortAddr

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 flex flex-col gap-12">
      {/* Profile header */}
      <div className="flex items-center gap-6">
        <div className="relative">
          {!loadingProfile ? (
            <ProfileAvatar
              address={address}
              avatarUrl={profile?.avatarUrl}
              size={80}
              editable={isOwner}
              onEdit={openEdit}
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-[#1a1a1a] animate-pulse" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {loadingProfile ? (
              <div className="h-4 w-28 bg-[#1a1a1a] animate-pulse rounded" />
            ) : (
              <p className="text-[#efefef] font-mono text-sm">{displayName}</p>
            )}
            {isOwner && !loadingProfile && (
              <button
                onClick={openEdit}
                className="text-[#555] hover:text-[#888] transition-colors"
                title="Edit profile"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
          <p className="text-[#555] font-mono text-xs break-all">{address}</p>
        </div>
      </div>

      {/* Edit profile panel */}
      {editing && isOwner && (
        <div className="border border-[#2a2a2a] p-4 flex flex-col gap-4">
          <p className="text-xs font-mono text-[#888] uppercase tracking-wider">Edit Profile</p>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono text-[#555] uppercase tracking-wider">Display Name</label>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder={shortAddr}
              maxLength={50}
              className="w-full bg-[#111] border border-[#2a2a2a] px-3 py-2 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-mono text-[#555] uppercase tracking-wider">Avatar URL</label>
            <input
              type="url"
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="https://… (leave blank for gradient avatar)"
              className="w-full bg-[#111] border border-[#2a2a2a] px-3 py-2 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555]"
            />
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" />
          <div className="flex gap-3">
            <button
              onClick={saveProfile}
              disabled={saving}
              className="px-4 py-2 text-xs font-mono border border-[#7C3AED] text-[#7C3AED] hover:bg-[#7C3AED] hover:text-white transition-colors disabled:opacity-40"
            >
              {saving ? 'saving…' : 'save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={saving}
              className="px-4 py-2 text-xs font-mono border border-[#2a2a2a] text-[#555] hover:border-[#888] hover:text-[#888] transition-colors disabled:opacity-40"
            >
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Mints */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-mono text-[#888] uppercase tracking-wider">
          Mints {!loadingMoments && `(${moments.length})`}
        </h2>
        {loadingMoments ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square bg-[#111] animate-pulse border border-[#1a1a1a]" />
            ))}
          </div>
        ) : moments.length === 0 ? (
          <p className="text-[#555] font-mono text-xs">no mints yet</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {moments.map((m) => (
              <MomentCard key={m.id} moment={m} />
            ))}
          </div>
        )}
      </section>

      {/* Listings */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-mono text-[#888] uppercase tracking-wider">
          Active Listings {!loadingListings && `(${listings.length})`}
        </h2>
        {loadingListings ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="aspect-square bg-[#111] animate-pulse border border-[#1a1a1a]" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <p className="text-[#555] font-mono text-xs">no active listings</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {listings.map((l) => (
              <MarketCard
                key={l.id}
                listing={l}
                onRemove={() => setListings((prev) => prev.filter((x) => x.id !== l.id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
