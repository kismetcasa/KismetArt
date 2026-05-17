'use client'

import { useEffect, useRef } from 'react'
import { useSharedVideoContext } from '@/providers/SharedVideoProvider'

interface Props {
  /** Canonical video URI (ar://, ipfs://, or https://). */
  src: string
  /** Show native controls + skip the off-screen pause behaviour. Detail
   *  page and lightbox set this to true. */
  controls?: boolean
  /** Z-index for the video element while this slot is active. Defaults
   *  to 10 (above page content). Overlay surfaces (intercepting routes
   *  modal) should pass a higher value to clear their backdrop. */
  zIndex?: number
  /** Fires when every gateway has errored for this src. The parent
   *  drops the slot and falls back to poster-only rendering. */
  onError?: () => void
  /** Visual className applied to the placeholder div the pool positions
   *  the video element over. Use the same sizing/layout classes you'd
   *  use on the <video> directly. */
  className?: string
}

/**
 * Anchor for the persistent shared video element. Renders an empty div
 * at the position/size the video should occupy; the SharedVideoProvider
 * CSS-positions a managed <video> element to overlay it.
 *
 * On mount: registers a slot with the pool. On unmount: releases (the
 * pool starts a 1-second grace timer so route transitions don't destroy
 * the element). ResizeObserver + window scroll/resize listeners keep
 * the video positioned correctly as the slot's bounds change.
 */
export function SharedVideoSlot({
  src,
  controls = false,
  zIndex = 10,
  onError,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const ctx = useSharedVideoContext()

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const release = ctx.acquire(src, {
      ref: el,
      controls,
      zIndex,
      onError,
    })

    // Reposition the video on any layout change that affects the slot.
    // ResizeObserver catches element-size changes; window scroll/resize
    // catch viewport changes. Scroll is passive — no performance cost.
    const ro = new ResizeObserver(() => ctx.refresh(src))
    ro.observe(el)
    const refresh = () => ctx.refresh(src)
    window.addEventListener('scroll', refresh, { passive: true })
    window.addEventListener('resize', refresh)

    return () => {
      release()
      ro.disconnect()
      window.removeEventListener('scroll', refresh)
      window.removeEventListener('resize', refresh)
    }
  }, [ctx, src, controls, zIndex, onError])

  return <div ref={ref} className={className} aria-hidden />
}
