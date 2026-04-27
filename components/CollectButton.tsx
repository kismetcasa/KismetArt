'use client'

import { useState } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { toast } from 'sonner'
import type { CollectPayload } from '@/lib/inprocess'

interface CollectButtonProps {
  collectionAddress: string
  tokenId: string
  className?: string
}

export function CollectButton({ collectionAddress, tokenId, className = '' }: CollectButtonProps) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [loading, setLoading] = useState(false)
  const [collected, setCollected] = useState(false)

  async function handleCollect() {
    if (!isConnected || !address) {
      openConnectModal?.()
      return
    }

    setLoading(true)
    try {
      const payload: CollectPayload = {
        moment: { collectionAddress, tokenId, chainId: 8453 },
        amount: 1,
        comment: 'collected via Kismet Art',
      }

      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? data.message ?? 'Collect failed')
      }

      setCollected(true)
      toast.success('Collected!', {
        description: `tx: ${data.hash?.slice(0, 10)}…`,
      })
    } catch (err) {
      toast.error('Collect failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleCollect}
      disabled={loading || collected}
      className={`text-xs font-mono tracking-wider uppercase px-4 py-2.5 border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        collected
          ? 'border-[#8B5CF6] text-[#8B5CF6] bg-[#8B5CF6]/10'
          : 'border-[#2a2a2a] text-[#888] hover:border-[#8B5CF6] hover:text-[#8B5CF6]'
      } ${className}`}
    >
      {loading ? 'collecting…' : collected ? 'collected' : 'collect'}
    </button>
  )
}
