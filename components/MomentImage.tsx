'use client'

import { useState, useEffect, useMemo } from 'react'
import Image, { type ImageProps } from 'next/image'
import { gatewayUrls } from '@/lib/arweave/gateways'

interface CommonProps {
  /** Raw URI: ar://, ipfs://, https://, blob:, or data: */
  src: string
  /** Fired once every gateway has errored, so the parent can swap in a placeholder. */
  onAllError?: () => void
  /**
   * Optional content-type hint from the moment metadata (`content.mime`).
   * When set to image/gif we bypass Vercel's image optimizer on the first try
   * — GIFs would lose animation if transcoded to AVIF/WebP, and Arweave bundles
   * often exceed the optimizer's 4MB source cap and 413 anyway.
   */
  mime?: string
}

// Animated GIFs can't survive next/image's AVIF/WebP transcode without losing
// animation, and the optimizer 413's on >4MB sources (common on Arweave). Both
// paths end up in `unoptimized` mode — detect upfront so we skip the doomed
// optimizer round-trip on the first paint.
function isGifUri(url: string): boolean {
  if (!url) return false
  // Strip query/hash so `?foo=bar` doesn't hide the extension; lower-case so
  // `.GIF` matches. Arweave URIs typically have no extension, so this only
  // catches the cases where the gateway/URL exposes one.
  const path = url.split(/[?#]/, 1)[0].toLowerCase()
  return path.endsWith('.gif')
}

function isGifMime(mime?: string): boolean {
  return mime === 'image/gif'
}

function useFallbackUrl(uri: string, onAllError?: () => void) {
  const urls = useMemo(() => gatewayUrls(uri), [uri])
  const [index, setIndex] = useState(0)
  // Reset when the URI changes (different moment, edit replaced the image, etc.)
  useEffect(() => { setIndex(0) }, [uri])
  return {
    url: index < urls.length ? urls[index] : null,
    onError: () => {
      const next = index + 1
      if (next >= urls.length) onAllError?.()
      setIndex(next)
    },
  }
}

type NextImageProps = CommonProps & Omit<ImageProps, 'src' | 'onError'>

/**
 * next/image wrapper that walks the public gateway pool on error. ar:// and
 * ipfs:// URIs fan out to every gateway in turn — the first 200 wins, and
 * onAllError fires once the pool is exhausted so the parent can show its
 * "no preview" fallback. https://, blob:, and data: URIs are rendered as-is.
 *
 * Each gateway is tried first via Vercel's image optimizer (smaller payload,
 * AVIF/WebP), then re-tried with `unoptimized` if the optimizer rejects the
 * source — Arweave commonly serves >4 MB artwork that hits Vercel's source
 * size cap and 413's, but the bytes load fine direct from the gateway.
 *
 * GIFs (detected via URL extension or the `mime` prop) skip the optimizer
 * entirely on the first try: the AVIF/WebP transcode loses animation, and the
 * 413 retry is wasted RTT.
 *
 * Phase 2 hooks:
 *  - Parallel gateway race: `useFallbackUrl` walks gateways serially on
 *    error. To race them in parallel on cold loads, call
 *    `probeFirstGateway()` from `@/lib/arweave/probe` and render the
 *    winning URL instead of `urls[0]`. Tradeoff: a 1-RTT HEAD probe before
 *    paint, in exchange for skipping the bad-gateway timeout on cold loads.
 *  - Edge image proxy: replace the per-gateway URL with `/api/img?u=<encoded>`
 *    where the route fetches the bytes from the gateway pool and serves them
 *    behind a long-cache header. Lets us put GIFs (which we mark `unoptimized`
 *    today) behind a CDN edge cache without losing animation.
 */
export function MomentImage({ src, onAllError, mime, priority, ...rest }: NextImageProps) {
  const { url, onError: walkGateway } = useFallbackUrl(src, onAllError)
  const skipOptimizer = isGifMime(mime) || isGifUri(src) || (url ? isGifUri(url) : false)
  // Per-URL bypass latch: false = try the optimizer first, true = optimizer
  // already failed for this URL (or we know upfront it'll fail — GIFs, etc.),
  // render direct. Reset when we move on to the next gateway (or to a
  // different URI entirely).
  const [bypass, setBypass] = useState(skipOptimizer)
  useEffect(() => { setBypass(skipOptimizer) }, [url, skipOptimizer])

  // Track first-byte paint so we can fade out a skeleton overlay. Resets on
  // every gateway/bypass change so the skeleton reappears if we fall back to
  // a different URL mid-render.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setLoaded(false) }, [url, bypass])

  if (!url) return null

  const handleError = () => {
    if (!bypass) {
      // First failure on this gateway URL — almost always Vercel's optimizer
      // 413'ing a >4 MB source. Retry the same URL unoptimized before
      // burning the gateway slot.
      setBypass(true)
      return
    }
    walkGateway()
  }

  return (
    <>
      {!loaded && (
        <span
          aria-hidden
          className="absolute inset-0 bg-[#1a1a1a] animate-pulse pointer-events-none"
        />
      )}
      {/* alt is required by ImageProps at the type level and comes through ...rest;
          bypass is part of the key so next/image actually remounts when we flip
          modes — otherwise the failed optimizer src stays cached. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        key={`${url}::${bypass}`}
        src={url}
        unoptimized={bypass}
        onError={handleError}
        onLoad={() => setLoaded(true)}
        decoding="async"
        priority={priority}
        {...rest}
      />
    </>
  )
}

type ImgProps = CommonProps & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'>

/**
 * Plain <img> with the same fallback behaviour as MomentImage. Use when raw
 * <img> semantics are needed — the lightbox shows a full-res unoptimized
 * image, and the edit-preview thumbnail can hold a blob URL from the file
 * picker (which next/image's optimizer doesn't accept).
 */
export function MomentImg({ src, onAllError, mime: _mime, ...rest }: ImgProps) {
  const { url, onError } = useFallbackUrl(src, onAllError)
  if (!url) return null
  // alt comes through ...rest; the lightbox/edit-preview call sites pass it.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img key={url} src={url} onError={onError} decoding="async" {...rest} />
}
