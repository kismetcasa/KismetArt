'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAccount } from 'wagmi'
import { RefreshCw } from 'lucide-react'
import { MomentCard } from '@/components/MomentCard'
import { MarketView } from '@/components/MarketView'
import type { Moment } from '@/lib/inprocess'
import { FEATURED_CREATOR } from '@/lib/config'

// ─── types ───────────────────────────────────────────────────────────────────

type TabId = 'featured' | 'trending' | 'main' | 'market'

const DRAGGABLE: TabId[] = ['featured', 'trending', 'main']
const LABEL: Record<TabId, string> = {
  featured: 'featured',
  trending: 'trending',
  main: 'main',
  market: 'market',
}

const ORDER_KEY = 'kismetart:tab-order'

function loadOrder(): TabId[] {
  if (typeof window === 'undefined') return DRAGGABLE
  try {
    const raw = localStorage.getItem(ORDER_KEY)
    if (!raw) return DRAGGABLE
    const parsed = JSON.parse(raw) as TabId[]
    if (parsed.length === 3 && DRAGGABLE.every((t) => parsed.includes(t))) return parsed
  } catch {}
  return DRAGGABLE
}

// ─── tab bar ─────────────────────────────────────────────────────────────────

function TabBar({
  order,
  active,
  onSelect,
  onReorder,
}: {
  order: TabId[]
  active: TabId
  onSelect: (t: TabId) => void
  onReorder: (o: TabId[]) => void
}) {
  const dragIdx = useRef<number | null>(null)

  function onDragStart(idx: number) {
    dragIdx.current = idx
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIdx.current === null || dragIdx.current === idx) return
    const next = [...order]
    const [moved] = next.splice(dragIdx.current, 1)
    next.splice(idx, 0, moved)
    dragIdx.current = idx
    onReorder(next)
  }

  function onDragEnd() {
    dragIdx.current = null
  }

  const all: TabId[] = [...order, 'market']

  return (
    <div className="flex items-end gap-0 border-b border-[#2a2a2a]">
      {all.map((tab, idx) => {
        const draggable = idx < 3
        const isActive = tab === active
        return (
          <button
            key={tab}
            draggable={draggable}
            onDragStart={draggable ? () => onDragStart(idx) : undefined}
            onDragOver={draggable ? (e) => onDragOver(e, idx) : undefined}
            onDragEnd={draggable ? onDragEnd : undefined}
            onClick={() => onSelect(tab)}
            className={`
              relative px-4 py-2.5 text-xs font-mono tracking-wider uppercase
              transition-colors select-none
              ${isActive ? 'text-[#efefef]' : 'text-[#444] hover:text-[#888]'}
              ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}
            `}
          >
            {LABEL[tab]}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-[#efefef]" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── moment feed ─────────────────────────────────────────────────────────────

function MomentFeed({
  feedKey,
  apiUrl,
  emptyMessage = 'nothing here yet',
  header,
}: {
  feedKey: string
  apiUrl: string
  emptyMessage?: string
  header?: React.ReactNode
}) {
  const [moments, setMoments] = useState<Moment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [refreshing, setRefreshing] = useState(false)

  const fetch_ = useCallback(
    async (p = 1, append = false) => {
      try {
        if (p === 1 && !append) setLoading(true)
        else setRefreshing(true)

        const url = new URL(apiUrl, location.origin)
        url.searchParams.set('page', String(p))
        url.searchParams.set('limit', '18')

        const res = await fetch(url.toString())
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const data = await res.json()

        setMoments((prev) => (append ? [...prev, ...data.moments] : data.moments))
        setTotalPages(data.pagination?.total_pages ?? 1)
        setPage(p)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiUrl],
  )

  // Reset + refetch when feedKey changes (tab switch or following toggle)
  useEffect(() => {
    setMoments([])
    setPage(1)
    fetch_(1)
  }, [feedKey, fetch_])

  return (
    <div>
      <div className="flex items-center justify-between py-4">
        <div>{header}</div>
        <button
          onClick={() => fetch_(1)}
          disabled={loading || refreshing}
          className="flex items-center gap-2 text-xs font-mono text-[#555] hover:text-[#888] transition-colors disabled:opacity-40"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          refresh
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#2a2a2a]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-[#0d0d0d]">
              <div className="aspect-square bg-[#161616] animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-[#161616] animate-pulse w-2/3" />
                <div className="h-3 bg-[#161616] animate-pulse w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="border border-red-900/50 p-6 text-center">
          <p className="text-sm font-mono text-red-400">{error}</p>
          <button
            onClick={() => fetch_(1)}
            className="mt-4 text-xs font-mono text-[#888] hover:text-[#efefef] underline"
          >
            try again
          </button>
        </div>
      )}

      {!loading && !error && moments.length === 0 && (
        <div className="border border-[#2a2a2a] p-8 sm:p-16 text-center">
          <p className="text-sm font-mono text-[#555]">{emptyMessage}</p>
        </div>
      )}

      {!loading && moments.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[#2a2a2a]">
            {moments.map((moment) => (
              <div key={`${moment.address}-${moment.token_id}`} className="bg-[#0d0d0d]">
                <MomentCard moment={moment} />
              </div>
            ))}
          </div>

          {page < totalPages && (
            <div className="mt-8 text-center">
              <button
                onClick={() => fetch_(page + 1, true)}
                disabled={refreshing}
                className="px-8 py-3 border border-[#2a2a2a] text-xs font-mono text-[#888] uppercase tracking-wider hover:border-[#555] hover:text-[#efefef] transition-colors disabled:opacity-40"
              >
                {refreshing ? 'loading…' : 'load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── main feed with following toggle ─────────────────────────────────────────

function MainFeed() {
  const { address } = useAccount()
  const [followingOn, setFollowingOn] = useState(false)
  const [followingAddrs, setFollowingAddrs] = useState<string[]>([])

  useEffect(() => {
    if (!address || !followingOn) { setFollowingAddrs([]); return }
    fetch(`/api/follow/${address}?list=1`)
      .then((r) => r.json())
      .then((d) => setFollowingAddrs(Array.isArray(d.addresses) ? d.addresses : []))
      .catch(() => setFollowingAddrs([]))
  }, [address, followingOn])

  const apiUrl = followingAddrs.length
    ? `/api/timeline?following=${followingAddrs.join(',')}`
    : '/api/timeline'

  const feedKey = `main-${followingOn ? 'following' : 'all'}-${followingAddrs.join(',')}`

  const header = address ? (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setFollowingOn((v) => !v)}
        className={`text-xs font-mono tracking-wider px-2.5 py-1 border transition-colors ${
          followingOn
            ? 'border-[#555] text-[#efefef]'
            : 'border-[#2a2a2a] text-[#444] hover:text-[#888] hover:border-[#444]'
        }`}
      >
        following
      </button>
    </div>
  ) : null

  return (
    <MomentFeed
      feedKey={feedKey}
      apiUrl={apiUrl}
      emptyMessage="no moments yet — be the first to mint"
      header={header}
    />
  )
}

// ─── discover page ────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const [order, setOrder] = useState<TabId[]>(DRAGGABLE)
  const [active, setActive] = useState<TabId>('featured')

  // Hydrate from localStorage after mount
  useEffect(() => {
    setOrder(loadOrder())
  }, [])

  function handleReorder(next: TabId[]) {
    setOrder(next)
    try { localStorage.setItem(ORDER_KEY, JSON.stringify(next)) } catch {}
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <TabBar order={order} active={active} onSelect={setActive} onReorder={handleReorder} />

      <div className="mt-2">
        {active === 'featured' && (
          <MomentFeed
            feedKey="featured"
            apiUrl={FEATURED_CREATOR ? `/api/timeline?creator=${FEATURED_CREATOR}` : '/api/timeline'}
            emptyMessage="no featured mints yet"
          />
        )}

        {active === 'trending' && (
          <MomentFeed
            feedKey="trending"
            apiUrl="/api/timeline?sort=trending"
            emptyMessage="no collects recorded yet — trending appears as mints are collected"
          />
        )}

        {active === 'main' && <MainFeed />}

        {active === 'market' && (
          <div className="pt-4">
            <MarketView />
          </div>
        )}
      </div>
    </div>
  )
}
