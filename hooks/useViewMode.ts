'use client'

import { useCallback, useEffect, useState } from 'react'

export type ViewMode = 'feed' | 'grid'

const STORAGE_KEY = 'kismetart:view-mode'

// SSR-safe init: defer the localStorage read until after mount to avoid
// hydration mismatches. Toggle persists per-device and applies globally
// across every feed that opts in via <PaginatedGrid viewMode>.
//
// All view-mode-aware feeds share the same storage key, so flipping
// the toggle once carries the preference to the next feed the user
// opens (main mints → trending stays in grid mode).
export function useViewMode(): [ViewMode, (next: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>('feed')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'grid' || raw === 'feed') setMode(raw)
    } catch {}
    // Subscribe to changes from other tabs/windows — toggling on the
    // discover tab in one window should reflect in another.
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return
      if (e.newValue === 'grid' || e.newValue === 'feed') setMode(e.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const update = useCallback((next: ViewMode) => {
    setMode(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch {}
  }, [])

  return [mode, update]
}
