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
 */
export function MomentImage({ src, onAllError, ...rest }: NextImageProps) {
  const { url, onError: walkGateway } = useFallbackUrl(src, onAllError)
  // Per-URL bypass latch: false = try the optimizer first, true = optimizer
  // already failed for this URL, render direct. Reset when we move on to the
  // next gateway (or to a different URI entirely).
  const [bypass, setBypass] = useState(false)
  useEffect(() => { setBypass(false) }, [url])

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

  // alt comes through ...rest; ImageProps already requires it at the type
  // level. The bypass flag is part of the key so next/image actually remounts
  // when we flip modes — otherwise the failed optimizer src stays cached.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image key={`${url}::${bypass}`} src={url} unoptimized={bypass} onError={handleError} {...rest} />
}

type ImgProps = CommonProps & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'>

/**
 * Plain <img> with the same fallback behaviour as MomentImage. Use when raw
 * <img> semantics are needed — the lightbox shows a full-res unoptimized
 * image, and the edit-preview thumbnail can hold a blob URL from the file
 * picker (which next/image's optimizer doesn't accept).
 */
export function MomentImg({ src, onAllError, ...rest }: ImgProps) {
  const { url, onError } = useFallbackUrl(src, onAllError)
  if (!url) return null
  // alt comes through ...rest; the lightbox/edit-preview call sites pass it.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img key={url} src={url} onError={onError} {...rest} />
}
