'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export function Nav() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#2a2a2a] bg-[#0d0d0d]/90 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-sm font-mono tracking-widest text-[#efefef] uppercase">
            Kismet Art
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                pathname === '/'
                  ? 'text-[#7C3AED]'
                  : 'text-[#888] hover:text-[#efefef]'
              }`}
            >
              Discover
            </Link>
            <Link
              href="/mint"
              className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                pathname === '/mint'
                  ? 'text-[#7C3AED]'
                  : 'text-[#888] hover:text-[#efefef]'
              }`}
            >
              Mint
            </Link>
            <Link
              href="/market"
              className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-colors ${
                pathname === '/market'
                  ? 'text-[#7C3AED]'
                  : 'text-[#888] hover:text-[#efefef]'
              }`}
            >
              Market
            </Link>
          </nav>
        </div>

        <ConnectButton
          showBalance={false}
          chainStatus="none"
          accountStatus="address"
        />
      </div>
    </header>
  )
}
