'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react'
import { gatewayUrls } from '@/lib/arweave/gateways'

/**
 * Persistent shared <video> element pool. Lives in the root layout so its
 * elements survive route transitions — the whole point of the abstraction.
 *
 * The architecture (see Plan C in the design discussion):
 *   - One <video> element per canonical src, owned by the pool.
 *   - Surfaces (cards, detail pages, etc.) register "slots" — empty divs
 *     in their own React tree that act as positioning anchors.
 *   - The pool CSS-positions the video element (position: fixed) to
 *     overlay whichever slot is currently active.
 *   - When the active slot unmounts (e.g. route change), the element
 *     stays alive for a 1-second grace window — long enough for the
 *     next surface to register and claim it without a remount.
 *   - When two surfaces claim the same src simultaneously (Plan C +
 *     Intercepting Routes case: feed card slot still mounted while the
 *     overlay slot mounts on top), "most recently mounted" wins.
 *
 * What persists by virtue of the element surviving:
 *   - Decoder state (no re-decode flicker on transition).
 *   - currentTime, paused, volume, muted, buffered ranges.
 *   - The HTTP cache context the browser maintains for the element.
 *
 * What lives per-surface (NOT in the pool):
 *   - Poster image rendering (the <MomentImg> in MomentVideo).
 *   - Thumbhash blur.
 *   - posterFailed state for graceful poster degradation.
 */

interface Slot {
  ref: HTMLElement
  controls: boolean
  /** Z-index for the video element while this slot is active. Card
   *  surfaces use the default (10); intercepting-route overlays raise it
   *  above the overlay's own z-50 backdrop. */
  zIndex: number
  /** Fired when every gateway has errored — caller drops the slot and
   *  shows the poster-only fallback. */
  onError?: () => void
}

interface ManagedVideo {
  el: HTMLVideoElement
  /** All currently-registered slots for this src, most-recently-mounted
   *  first. The 0th entry is the "active" slot the element is positioned
   *  over. When a slot releases, fall back to the next in the list — this
   *  is what makes Plan C + Intercepting Routes coexist correctly: the
   *  card slot stays in the list while the overlay slot is active on
   *  top, so closing the overlay drops back to the card without
   *  re-creating the element. */
  slots: Slot[]
  releaseTimer: number | null
  observer: IntersectionObserver | null
  gateways: string[]
  gatewayIndex: number
  src: string
  loaded: boolean
  lastActiveAt: number
}

interface ContextValue {
  /** Register a slot for `src`. Returns a release fn to call on unmount. */
  acquire: (src: string, slot: Slot) => () => void
  /** Recompute the active slot's position (call on scroll / resize). */
  refresh: (src: string) => void
}

const Ctx = createContext<ContextValue | null>(null)

export function useSharedVideoContext(): ContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) {
    throw new Error(
      'useSharedVideoContext must be used inside <SharedVideoProvider>',
    )
  }
  return ctx
}

// Grace window after a slot releases — long enough for the next surface
// to claim the element on a route transition without the element being
// destroyed and re-created.
const RELEASE_GRACE_MS = 1000

// Pool entries with no active slot for this long get destroyed.
const IDLE_EVICT_MS = 5 * 60 * 1000

// Hard cap on pool size. Past this, idle entries get evicted on next acquire.
const MAX_POOL_SIZE = 10

export function SharedVideoProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const poolRef = useRef<Map<string, ManagedVideo>>(new Map())

  function positionElement(video: ManagedVideo, slot: Slot) {
    const rect = slot.ref.getBoundingClientRect()
    const el = video.el
    el.style.top = `${rect.top}px`
    el.style.left = `${rect.left}px`
    el.style.width = `${rect.width}px`
    el.style.height = `${rect.height}px`
    el.style.zIndex = String(slot.zIndex)
    el.style.pointerEvents = slot.controls ? 'auto' : 'none'
    el.controls = slot.controls
    if (video.loaded) el.style.visibility = 'visible'
  }

  function activateSlot(video: ManagedVideo, slot: Slot) {
    if (video.releaseTimer !== null) {
      clearTimeout(video.releaseTimer)
      video.releaseTimer = null
    }
    video.lastActiveAt = Date.now()
    positionElement(video, slot)

    // Replace any prior IntersectionObserver. For controlled surfaces
    // (detail page, lightbox) the user owns play/pause; the observer
    // would fight their input. Otherwise observe the slot's viewport
    // visibility and pause off-screen videos.
    video.observer?.disconnect()
    video.observer = null
    if (!slot.controls) {
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            video.el.play().catch(() => {})
          } else {
            video.el.pause()
          }
        },
        { threshold: 0.01, rootMargin: '200px' },
      )
      io.observe(slot.ref)
      video.observer = io
    }
  }

  function deactivate(video: ManagedVideo) {
    video.observer?.disconnect()
    video.observer = null
    video.el.style.visibility = 'hidden'
    video.el.pause()
  }

  function destroyVideo(video: ManagedVideo) {
    video.observer?.disconnect()
    if (video.releaseTimer !== null) clearTimeout(video.releaseTimer)
    video.el.pause()
    video.el.removeAttribute('src')
    video.el.load()
    video.el.remove()
  }

  function evictIdleIfOverCap() {
    if (poolRef.current.size <= MAX_POOL_SIZE) return
    // Collect candidates first, then sort — avoids TypeScript narrowing
    // issues with closure-captured `let` variables inside forEach.
    const candidates: Array<{ src: string; video: ManagedVideo }> = []
    poolRef.current.forEach((video, src) => {
      if (video.slots.length === 0) candidates.push({ src, video })
    })
    candidates.sort((a, b) => a.video.lastActiveAt - b.video.lastActiveAt)
    const oldest = candidates[0]
    if (oldest) {
      destroyVideo(oldest.video)
      poolRef.current.delete(oldest.src)
    }
  }

  function createVideo(src: string): ManagedVideo {
    const gateways = gatewayUrls(src)
    const el = document.createElement('video')
    el.autoplay = true
    el.muted = true
    el.loop = true
    el.playsInline = true
    el.preload = 'metadata'
    el.style.position = 'fixed'
    el.style.objectFit = 'contain'
    el.style.visibility = 'hidden'
    el.style.opacity = '0'
    el.style.transition =
      'top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease'

    const video: ManagedVideo = {
      el,
      slots: [],
      releaseTimer: null,
      observer: null,
      gateways,
      gatewayIndex: 0,
      src,
      loaded: false,
      lastActiveAt: Date.now(),
    }

    // Gateway walking — on error, try the next gateway. When the pool is
    // exhausted, notify every registered slot's onError so each caller
    // can drop the slot and show the poster fallback. We notify all
    // slots (not just the active one) because they all depend on this
    // failed src; quietly leaving inactive slots subscribed to a dead
    // element would mean they'd never know to render their fallback.
    el.addEventListener('error', () => {
      const next = video.gatewayIndex + 1
      if (next < video.gateways.length) {
        video.gatewayIndex = next
        el.src = video.gateways[next]!
      } else {
        video.slots.forEach((s) => s.onError?.())
      }
    })

    // First-frame paint: reveal the element. Same element persists across
    // surfaces, so this fires once per src (not once per surface).
    el.addEventListener('loadeddata', () => {
      video.loaded = true
      el.style.opacity = '1'
      if (video.slots.length > 0) el.style.visibility = 'visible'
    })

    el.src = gateways[0] ?? src
    containerRef.current?.appendChild(el)

    return video
  }

  // Stable function identities — the pool state lives in poolRef.current.
  const value = useMemo<ContextValue>(
    () => ({
      acquire(src: string, slot: Slot) {
        let video = poolRef.current.get(src)
        if (!video) {
          video = createVideo(src)
          poolRef.current.set(src, video)
          evictIdleIfOverCap()
        }
        // Push to the front of the slots list — this slot is now
        // most-recent and becomes the active one.
        video.slots.unshift(slot)
        activateSlot(video, slot)
        return () => {
          if (!video) return
          const idx = video.slots.indexOf(slot)
          if (idx === -1) return
          const wasActive = idx === 0
          video.slots.splice(idx, 1)
          if (!wasActive) return
          // Active slot released. If there's another registered slot
          // (e.g. card slot still mounted while overlay slot just
          // released), fall back to it immediately — no grace timer
          // needed because we have somewhere to go.
          const next = video.slots[0]
          if (next) {
            activateSlot(video, next)
            return
          }
          // No remaining slots — start the grace timer. If a new slot
          // for this src mounts within the grace window (typical
          // route-transition pattern), it'll cancel the timer and
          // reuse the element.
          video.releaseTimer = window.setTimeout(() => {
            deactivate(video)
          }, RELEASE_GRACE_MS)
        }
      },
      refresh(src: string) {
        const video = poolRef.current.get(src)
        const active = video?.slots[0]
        if (video && active) positionElement(video, active)
      },
    }),
    // All helper functions close over refs (stable across renders) — no
    // need to re-create the context value when the component re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Periodic eviction of idle entries past the TTL.
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now()
      poolRef.current.forEach((video, src) => {
        if (video.slots.length === 0 && now - video.lastActiveAt > IDLE_EVICT_MS) {
          destroyVideo(video)
          poolRef.current.delete(src)
        }
      })
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* Container for managed <video> elements. position: fixed inset-0
          provides a stacking context separate from page content. Children
          (video elements) override position: fixed with their own coords,
          which are computed from active slot bounds. pointer-events: none
          means clicks pass through; individual videos with controls toggle
          their own pointer-events back on per-slot. */}
      <div
        ref={containerRef}
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{ contain: 'layout', zIndex: 0 }}
      />
    </Ctx.Provider>
  )
}
