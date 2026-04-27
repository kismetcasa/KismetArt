'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Compass, Zap, Tag } from 'lucide-react'

const links = [
  { href: '/', label: 'Discover', Icon: Compass },
  { href: '/mint', label: 'Mint', Icon: Zap },
  { href: '/market', label: 'Market', Icon: Tag },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-[#2a2a2a] bg-[#0d0d0d]/95 backdrop-blur-sm flex h-14">
      {links.map(({ href, label, Icon }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? 'text-[#8B5CF6]' : 'text-[#555] hover:text-[#888]'
            }`}
          >
            <Icon size={18} />
            <span className="text-[9px] font-mono uppercase tracking-wider">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
