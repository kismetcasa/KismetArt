'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { WalletButton } from './WalletButton'
import { ProfileAvatar } from './ProfileAvatar'
import { SearchBar } from './SearchBar'
import { SearchModal } from './SearchModal'

export function Nav() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined)
  const [displayName, setDisplayName] = useState<string | undefined>(undefined)
  const [searchOpen, setSearchOpen] = useState(false)
  const [modalQuery, setModalQuery] = useState('')

  useEffect(() => {
    if (!address) { setAvatarUrl(undefined); setDisplayName(undefined); return }
    fetch(`/api/profile/${address}`)
      .then((r) => r.json())
      .then((d) => {
        setAvatarUrl(d.profile?.avatarUrl)
        setDisplayName(d.profile?.username || d.profile?.ensName)
      })
      .catch(() => {})
  }, [address])

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a2a] bg-[#0d0d0d]/90 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-sm font-mono tracking-widest uppercase accent-grad">
              Kismet Art
            </Link>
            <nav className="hidden sm:flex items-center gap-1">
              <Link
                href="/"
                className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                  pathname === '/' ? 'text-[#888] font-bold' : 'text-[#888] hover:text-[#efefef]'
                }`}
              >
                Discover
              </Link>
              <Link
                href="/mint"
                className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                  pathname === '/mint' ? 'text-[#888] font-bold' : 'text-[#888] hover:text-[#efefef]'
                }`}
              >
                Mint
              </Link>
              <SearchBar onOpenModal={(q) => { setModalQuery(q); setSearchOpen(true) }} />
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* Search icon on mobile */}
            <button
              onClick={() => { setModalQuery(''); setSearchOpen(true) }}
              className="sm:hidden text-[#888] hover:text-[#efefef] transition-colors p-1"
            >
              <Search size={18} />
            </button>
            <WalletButton displayName={displayName} />
            {isConnected && address && (
              <Link href={`/profile/${address}`} className="flex-shrink-0">
                <ProfileAvatar address={address} avatarUrl={avatarUrl} size={32} clickable />
              </Link>
            )}
          </div>
        </div>
      </header>

      {searchOpen && <SearchModal onClose={() => { setSearchOpen(false); setModalQuery('') }} initialQuery={modalQuery} />}
    </>
  )
}
