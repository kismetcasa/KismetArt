'use client'

import { useState, useEffect, useMemo } from 'react'
import Image, { type ImageProps } from 'next/image'
import { gatewayUrls } from '@/lib/arweave/gateways'

interface CommonProps {
  /** Raw URI: ar://, ipfs://, https://, blob:, or data: */
  src: string
  /** Fired once every fallback has errored, so the parent can swap in a placeholder. */
  onAllError?: () => void
  /**
   * Optional content-type hint from the moment metadata (`content.mime`).
   * When set to image/gif we skip the optimizer attempt and route straight
   * to the proxy: GIFs lose animation through next/image's AVIF/WebP
   * transcode, and Arweave bundles routinely exceed the optimizer's 4MB
   * source cap and 413 anyway.
   */
  mime?: string
}

// Animated GIFs can't survive the optimizer's transcode without losing
// animation, and >4MB Arweave bundles 413 on the source-size cap. Both end
// up needing `unoptimized` — detect upfront so we skip the doomed
// optimizer round-trip on first paint. URI-based detection rarely fires for
// raw `ar://` content (no extension), so the `mime` hint from metadata
// carries most of the weight here.
function isGifUri(url: string): boolean {
  if (!url) return false
  const path = url.split(/[?#]/, 1)[0].toLowerCase()
  return path.endsWith('.gif')
}

function isGifMime(mime?: string): boolean {
  return mime === 'image/gif'
}

function isProxiable(uri: string): boolean {
  return uri.startsWith('ar://') || uri.startsWith('ipfs://')
}

function proxyUrl(uri: string): string {
  return `/api/img?u=${encodeURIComponent(uri)}`
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

type DeliveryMode = 'optimized' | 'proxy' | 'direct'

type NextImageProps = CommonProps & Omit<ImageProps, 'src' | 'onError'>

/**
 * next/image wrapper with a three-stage delivery path:
 *
 *   1. 'optimized' — next/image's optimizer. Cheapest payload (AVIF/WebP
 *      transcode, 31-day Vercel edge cache). Default for `ar://`/`ipfs://`
 *      content the optimizer can handle (small static images).
 *
 *   2. 'proxy' — `/api/img?u=<src>` streams bytes from our gateway pool
 *      with `Cache-Control: public, max-age=1y, immutable`. Used when the
 *      optimizer can't help: animated GIFs (transcode would kill animation)
 *      and any source the optimizer 413's on (>4MB). The proxy edge-caches
 *      the response globally, so repeat viewers in any region pay only the
 *      first round-trip rather than re-fetching from Arweave each time.
 *
 *   3. 'direct' — raw gateway URL, `unoptimized`. Defense-in-depth fallback
 *      when the proxy itself fails (deploy in flight, function cold-start
 *      hiccup, infra blip). Walks the gateway pool as before.
 *
 * Transitions:
 *   optimized --[error]--> proxy (if ar://ipfs://)  |  direct (else)
 *   proxy     --[error]--> direct
 *   direct    --[error]--> walk next gateway URL    |  onAllError when exhausted
 */
export function MomentImage({ src, onAllError, mime, priority, ...rest }: NextImageProps) {
  const { url, onError: walkGateway } = useFallbackUrl(src, onAllError)
  const proxiable = isProxiable(src)
  // URI- and mime-based detection of content the optimizer can't help with.
  // Reads `src` (not `url`) so the decision is stable across gateway walks
  // — the state machine below would reset if this flipped mid-walk.
  // Arweave/IPFS URIs are content-addressed without extensions, so mime
  // carries the weight here; URL-extension catches the rare `*.gif` https.
  const skipOptimizer = isGifMime(mime) || isGifUri(src)

  // Initial delivery mode. If we already know the optimizer won't help, jump
  // straight to proxy (when proxiable) or direct. Otherwise try the
  // optimizer first — its AVIF/WebP transcode beats the proxy for small
  // static images that fit under the 4MB cap.
  const initialMode: DeliveryMode = skipOptimizer
    ? (proxiable ? 'proxy' : 'direct')
    : 'optimized'
  const [mode, setMode] = useState<DeliveryMode>(initialMode)
  // Reset the state machine when the source URI changes (different moment,
  // edited image, etc.). `url` is intentionally NOT in the deps — walking
  // to the next gateway must stay in 'direct' mode rather than restarting.
  useEffect(() => { setMode(initialMode) }, [src, initialMode])

  // The actual URL we feed <Image>:
  //   'proxy'     -> /api/img?u=<src> — single stable URL; the proxy fans
  //                  out to gateways itself, so we don't walk here.
  //   'optimized' -> current direct gateway URL with optimizer on.
  //   'direct'    -> current direct gateway URL with optimizer off.
  const renderUrl = mode === 'proxy' ? proxyUrl(src) : url
  const unoptimized = mode !== 'optimized'

  // Skeleton placeholder visible until the rendered <Image> fires onLoad.
  // Reset whenever the URL or optimization mode flips so the placeholder
  // reappears for each new fetch attempt.
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setLoaded(false) }, [renderUrl, unoptimized])

  if (!renderUrl) return null

  const handleError = () => {
    if (mode === 'optimized') {
      // Optimizer rejected the source — almost always a 413 on >4MB Arweave
      // bundles, occasionally an unsupported format. Prefer the proxy when
      // we can (it edge-caches the bytes); fall back to direct unoptimized
      // on the same URL for non-proxiable sources (https://).
      setMode(proxiable ? 'proxy' : 'direct')
      return
    }
    if (mode === 'proxy') {
      // Proxy returned non-2xx (502 from all-gateways-failed, deploy mid-
      // flight, etc.). The proxy already raced every gateway server-side
      // so direct walk is mostly defensive — but it gives us a chance if
      // the proxy itself is the only thing broken.
      setMode('direct')
      return
    }
    // mode === 'direct' — walk to the next gateway URL in the pool.
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
          (renderUrl + unoptimized) is the key so next/image actually remounts
          when we change modes — otherwise the failed src stays cached
          internally and onError won't refire on the new attempt. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        key={`${renderUrl}::${unoptimized}`}
        src={renderUrl}
        unoptimized={unoptimized}
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
 * Plain <img> with the same proxy + gateway fallback as MomentImage. Used
 * for raw <img> semantics: the lightbox needs a full-res unoptimized
 * image, and the edit-preview thumbnail holds blob: URLs from the file
 * picker (which next/image's optimizer doesn't accept).
 *
 * Two-stage delivery, simpler than MomentImage's three-stage because there's
 * no optimizer to attempt:
 *   1. 'proxy'  — `/api/img?u=<src>` for ar://ipfs:// (edge-cached). Shares
 *                 the same cache key with MomentImage so the lightbox doesn't
 *                 re-fetch what the hero already populated.
 *   2. 'direct' — raw gateway URL fallback if the proxy errors, walking the
 *                 pool the same way as before. https:// / blob: / data:
 *                 URIs skip the proxy entirely (no benefit).
 */
export function MomentImg({ src, onAllError, mime: _mime, ...rest }: ImgProps) {
  const { url: walkedUrl, onError: walkGateway } = useFallbackUrl(src, onAllError)
  const proxiable = isProxiable(src)
  const [proxyFailed, setProxyFailed] = useState(false)
  // Reset on src change so a new image gets a fresh proxy attempt.
  useEffect(() => { setProxyFailed(false) }, [src])

  const useProxy = proxiable && !proxyFailed
  const renderUrl = useProxy ? proxyUrl(src) : walkedUrl
  if (!renderUrl) return null

  const handleError = useProxy ? () => setProxyFailed(true) : walkGateway

  // alt comes through ...rest; the lightbox/edit-preview call sites pass it.
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img key={renderUrl} src={renderUrl} onError={handleError} decoding="async" {...rest} />
}
