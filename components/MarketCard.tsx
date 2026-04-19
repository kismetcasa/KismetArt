'use client'

import { useState, useEffect } from 'react'
import { CollectButton } from '@/components/CollectButton'
import { resolveUri, formatPrice, shortAddress, type Moment, type MomentDetail } from '@/lib/inprocess'

interface MarketCardProps {
  moment: Moment
}

export function MarketCard({ moment }: MarketCardProps) {
  const [detail, setDetail] = useState<MomentDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const params = new URLSearchParams({
          collectionAddress: moment.address,
          tokenId: moment.token_id,
        })
        const res = await fetch(`/api/moment?${params}`)
        if (res.ok) setDetail(await res.json())
      } catch {}
      setLoading(false)
    }
    load()
  }, [moment.address, moment.token_id])

  const imageUri = detail?.metadata?.image ? resolveUri(detail.metadata.image) : null
  const price = detail?.saleConfig?.pricePerToken != null ? formatPrice(detail.saleConfig.pricePerToken) : null
  const saleActive =
    detail?.saleConfig != null &&
    Number(detail.saleConfig.saleEnd) > Date.now() / 1000

  return (
    <div className="bg-[#0d0d0d] flex flex-col">
      {/* Thumbnail */}
      <div className="aspect-square bg-[#111] overflow-hidden">
        {loading ? (
          <div className="w-full h-full animate-pulse bg-[#161616]" />
        ) : imageUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUri} alt={detail?.metadata?.name ?? ''} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[#161616]" />
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-mono text-[#efefef] truncate">
              {loading ? '—' : (detail?.metadata?.name ?? 'untitled')}
            </p>
            <p className="text-xs font-mono text-[#555] mt-0.5">
              {shortAddress(moment.default_admin?.address ?? '')}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs font-mono text-[#d4f53c]">
              {loading ? '—' : (price ?? '—')}
            </p>
            <p className="text-xs font-mono text-[#333] mt-0.5">royalties enforced</p>
          </div>
        </div>

        {!loading && saleActive && (
          <CollectButton
            collectionAddress={moment.address}
            tokenId={moment.token_id}
            className="w-full"
          />
        )}

        {!loading && !saleActive && (
          <p className="text-xs font-mono text-[#333] text-center py-2">sale ended</p>
        )}
      </div>
    </div>
  )
}
