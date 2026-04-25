'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { CollectButton } from './CollectButton'
import { ListButton } from './ListButton'
import { resolveUri, formatPrice, shortAddress, type Moment, type MomentDetail } from '@/lib/inprocess'

interface MomentCardProps {
  moment: Moment
}

export function MomentCard({ moment }: MomentCardProps) {
  const [imgError, setImgError] = useState(false)
  const [price, setPrice] = useState<string | null>(null)

  const meta = moment.metadata ?? {}

  // Fetch sale config for price display
  useEffect(() => {
    const params = new URLSearchParams({
      collectionAddress: moment.address,
      tokenId: moment.token_id,
      chainId: '8453',
    })
    fetch(`/api/moment?${params}`)
      .then((r) => r.ok ? r.json() as Promise<MomentDetail> : Promise.reject())
      .then((detail) => setPrice(formatPrice(detail.saleConfig.pricePerToken)))
      .catch(() => {})
  }, [moment.address, moment.token_id])

  const imageUrl = meta.image ? resolveUri(meta.image) : null
  const isVideo =
    meta.content?.mime?.startsWith('video/') ||
    meta.animation_url?.endsWith('.mp4') ||
    meta.animation_url?.endsWith('.webm')

  const mediaUrl = isVideo && meta.animation_url ? resolveUri(meta.animation_url) : imageUrl

  return (
    <article className="group flex flex-col bg-[#161616] border border-[#2a2a2a] overflow-hidden">
      {/* Media */}
      <div className="relative aspect-square bg-[#111] overflow-hidden">
        {isVideo && mediaUrl ? (
          <video
            src={mediaUrl}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        ) : imageUrl && !imgError ? (
          <Image
            src={imageUrl}
            alt={meta.name ?? 'moment'}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[#2a2a2a] font-mono text-xs">no preview</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3">
        <div>
          <h3 className="text-sm text-[#efefef] font-mono truncate">
            {meta.name ?? `#${moment.token_id}`}
          </h3>
          {meta.description && (
            <p className="text-xs text-[#888] mt-1 line-clamp-2 leading-relaxed">
              {meta.description}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <a
              href={`https://inprocess.world/collect/base:${moment.address}/${moment.token_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#555] font-mono hover:text-[#888] transition-colors"
              title={moment.creator.address}
            >
              {shortAddress(moment.creator.address)}
            </a>
            {price !== null && (
              <span className="text-xs font-mono text-[#7C3AED]">{price}</span>
            )}
          </div>

          <CollectButton
            collectionAddress={moment.address}
            tokenId={moment.token_id}
          />
        </div>
        <ListButton
          collectionAddress={moment.address}
          tokenId={moment.token_id}
          name={meta.name}
          image={meta.image ? resolveUri(meta.image) : undefined}
          creatorAddress={moment.creator?.address}
        />
      </div>
    </article>
  )
}
