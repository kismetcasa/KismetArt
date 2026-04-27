'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { useEffect, useState } from 'react'
import { ProfileAvatar } from './ProfileAvatar'

export function Nav() {
  const pathname = usePathname()
  const { address, isConnected } = useAccount()
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!address) { setAvatarUrl(undefined); return }
    fetch(`/api/profile/${address}`)
      .then((r) => r.json())
      .then((d) => setAvatarUrl(d.profile?.avatarUrl))
      .catch(() => {})
  }, [address])

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a2a] bg-[#0d0d0d]/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-mono tracking-widest uppercase accent-grad">
            Kismet Art
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                pathname === '/'
                  ? 'accent-grad'
                  : 'text-[#888] hover:text-[#efefef]'
              }`}
            >
              Discover
            </Link>
            <Link
              href="/mint"
              className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                pathname === '/mint'
                  ? 'accent-grad'
                  : 'text-[#888] hover:text-[#efefef]'
              }`}
            >
              Mint
            </Link>
            <Link
              href="/market"
              className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                pathname === '/market'
                  ? 'accent-grad'
                  : 'text-[#888] hover:text-[#efefef]'
              }`}
            >
              Market
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ConnectButton
            showBalance={false}
            chainStatus="none"
            accountStatus="address"
          />
          {isConnected && address && (
            <Link href={`/profile/${address}`} className="flex-shrink-0">
              <ProfileAvatar address={address} avatarUrl={avatarUrl} size={32} />
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
