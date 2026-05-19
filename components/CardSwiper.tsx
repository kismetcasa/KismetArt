'use client'

import type { ReactNode } from 'react'

/**
 * Horizontal snap-scroller used by the grid-view layout. Card widths
 * target 2/3/4/6 visible at mobile / sm / md / lg+ — roughly doubling
 * the feed-view grid's 1/2/3 density. The arithmetic on each w-[calc]
 * accounts for the gap-3 (0.75rem) between cards so they line up flush
 * with the container edges instead of overflowing.
 *
 * lg's 6-across applies at xl+ too (no separate xl breakpoint): at
 * desktop widths the cards stay readable instead of squeezing to 8 per
 * row on wide monitors.
 *
 * -mx-4 / px-4 lets the scroller extend to the viewport edge (the
 * outer page containers use px-4) so users can swipe from the very
 * edge; the inner px-4 restores the gutter for the first and last
 * cards. snap-mandatory snaps each card to the leading edge on
 * swipe-release for a deliberate, paged feel.
 *
 * Extracted so PaginatedGrid (discover/trending/market feeds) and
 * ProfileView (mints, collected, listings sections) share a single
 * source of truth — tweaking density or snap behavior happens once.
 */
export function CardSwiper({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 px-4 overflow-x-auto flex gap-3 snap-x snap-mandatory [-webkit-overflow-scrolling:touch] pb-4">
      {children}
    </div>
  )
}

export function CardSwiperItem({ children }: { children: ReactNode }) {
  return (
    <div className="flex-shrink-0 snap-start w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.5rem)] md:w-[calc(25%-0.5625rem)] lg:w-[calc(16.667%-0.625rem)]">
      {children}
    </div>
  )
}
