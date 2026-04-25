'use client'

import { useState } from 'react'

interface ProfileAvatarProps {
  address: string
  avatarUrl?: string
  size?: number
  editable?: boolean
  onEdit?: () => void
}

function addressToGradient(address: string): { from: string; to: string; angle: number } {
  const hex = address.replace('0x', '').toLowerCase()
  const r1 = parseInt(hex.slice(0, 2), 16)
  const g1 = parseInt(hex.slice(2, 4), 16)
  const b1 = parseInt(hex.slice(4, 6), 16)
  const r2 = parseInt(hex.slice(6, 8), 16)
  const g2 = parseInt(hex.slice(8, 10), 16)
  const b2 = parseInt(hex.slice(10, 12), 16)
  const angle = parseInt(hex.slice(12, 14), 16) % 360
  return {
    from: `rgb(${r1},${g1},${b1})`,
    to: `rgb(${r2},${g2},${b2})`,
    angle,
  }
}

export function ProfileAvatar({ address, avatarUrl, size = 40, editable = false, onEdit }: ProfileAvatarProps) {
  const [imgError, setImgError] = useState(false)
  const grad = addressToGradient(address)

  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    background: `linear-gradient(${grad.angle}deg, ${grad.from}, ${grad.to})`,
    flexShrink: 0,
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div style={style} className="cursor-default select-none">
      {avatarUrl && !imgError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt="avatar"
          style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
          onError={() => setImgError(true)}
        />
      )}
      {editable && onEdit && (
        <button
          onClick={onEdit}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          className="bg-black/50 opacity-0 hover:opacity-100 transition-opacity text-white text-xs font-mono"
        >
          edit
        </button>
      )}
    </div>
  )
}
