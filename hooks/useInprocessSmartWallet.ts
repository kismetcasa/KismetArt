'use client'

import { useEffect, useState } from 'react'

// Module-level cache: the inprocess smart-wallet address is per-API-key
// and effectively immutable, so once we've resolved it we hold it for
// the lifetime of the tab. The shared in-flight Promise ensures that
// concurrent callers (e.g. CreateCollectionForm on /mint and
// CollectionView on /collection/X opened in adjacent tabs of the same
// app shell) coalesce onto a single fetch.
let cached: string | null | undefined = undefined
let inFlight: Promise<string | null> | null = null

async function load(): Promise<string | null> {
  if (cached !== undefined) return cached
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch('/api/inprocess/smart-wallet')
      if (!res.ok) {
        cached = null
        return null
      }
      const data = (await res.json()) as { address?: string }
      cached = typeof data?.address === 'string' ? data.address : null
      return cached
    } catch {
      cached = null
      return null
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Imperative resolver — returns the cached value when available, else
 * triggers (or joins) the single in-flight fetch. Use this from inside
 * an async handler (e.g. `handleCreate`) when you need the address
 * exactly once at action time and want to await it.
 */
export async function fetchInprocessSmartWallet(): Promise<string | null> {
  return load()
}

/**
 * Reactive hook — subscribes a component to the resolved value. Returns
 * `{ address: null, loading: true }` on first mount, then re-renders with
 * the cached address (or null on failure) once the fetch completes.
 * Subsequent mounts hit the cache and skip the fetch entirely.
 */
export function useInprocessSmartWallet(): { address: string | null; loading: boolean } {
  const [address, setAddress] = useState<string | null>(cached ?? null)
  const [loading, setLoading] = useState<boolean>(cached === undefined)

  useEffect(() => {
    if (cached !== undefined) {
      setAddress(cached ?? null)
      setLoading(false)
      return
    }
    let cancelled = false
    load().then((a) => {
      if (cancelled) return
      setAddress(a)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { address, loading }
}
