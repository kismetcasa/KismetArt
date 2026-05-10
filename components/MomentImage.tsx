'use client'

import { useState, useEffect, useMemo } from 'react'
import Image, { type ImageProps } from 'next/image'
import { gatewayUrls } from '@/lib/arweave/gateways'

interface CommonProps {
  /** Raw URI: ar://, ipfs://, https://, blob:, or data: */
  src: string
  /** Fired once every gateway has errored, so the parent can swap in a placeholder. */
  onAllError?: () => void
}

interface FallbackState {
  /** Index into the gateway pool we're currently rendering from. */
  gatewayIndex: number
  /** True after the optimizer has 413/400'd this URL and we've retried unoptimized. */
  unoptimized: boolean
}

function useFallbackUrl(uri: string, onAllError?: () => void) {
  const urls = useMemo(() => gatewayUrls(uri), [uri])
  const [state, setState] = useState<FallbackState>({ gatewayIndex: 0, unoptimized: false })
  // Reset when the URI changes (different moment, edit replaced the image, etc.)
  useEffect(() => { setState({ gatewayIndex: 0, unoptimized: false }) }, [uri])

  const url = state.gatewayIndex < urls.length ? urls[state.gatewayIndex] : null

  return {
    url,
    unoptimized: state.unoptimized,
    onError: () => {
      setState((prev) => {
        // First failure on a given gateway URL: most often Vercel's image
        // optimizer returning 413 when the source exceeds its 4 MB limit
        // (common for full-resolution Arweave/IPFS artwork). Retry the
        // same URL with the optimizer bypassed before walking gateways —
        // that recovers without burning through the entire pool.
        if (!prev.unoptimized) return { ...prev, unoptimized: true }
        const next = prev.gatewayIndex + 1
        if (next >= urls.length) onAllError?.()
        return { gatewayIndex: next, unoptimized: false }
      })
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
 * AVIF/WebP), then re-tried with `unoptimized` if the optimizer 413/400's —
 * Arweave can serve >4 MB artwork that the optimizer rejects, but the bytes
 * load fine direct from the gateway.
 */
export function MomentImage({ src, onAllError, ...rest }: NextImageProps) {
  const { url, unoptimized, onError } = useFallbackUrl(src, onAllError)
  if (!url) return null
  // alt comes through ...rest; ImageProps already requires it at the type level.
  // Key includes the unoptimized flag so React remounts when we switch modes
  // on the same URL — otherwise next/image keeps the failed src cached.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image key={`${url}::${unoptimized}`} src={url} unoptimized={unoptimized} onError={onError} {...rest} />
}

type ImgProps = CommonProps & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'>

/**
 * Plain <img> with the same fallback behaviour as MomentImage. Use when raw
 * <img> semantics are needed — the lightbox shows a full-res unoptimized
 * image, and the edit-preview thumbnail can hold a blob URL from the file
 * picker (which next/image's optimizer doesn't accept).
 */
export function MomentImg({ src, onAllError, ...rest }: ImgProps) {
  const urls = useMemo(() => gatewayUrls(src), [src])
  const [index, setIndex] = useState(0)
  useEffect(() => { setIndex(0) }, [src])
  const url = index < urls.length ? urls[index] : null
  if (!url) return null
  // alt comes through ...rest; the lightbox/edit-preview call sites pass it.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img key={url} src={url} onError={() => {
    const next = index + 1
    if (next >= urls.length) onAllError?.()
    setIndex(next)
  }} {...rest} />
}
