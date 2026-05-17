'use client'

import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useEscapeKey } from '@/hooks/useEscapeKey'

/**
 * Backdrop + close affordance + scroll container for the intercepted
 * detail-page route. The route handler wraps <MomentDetailView> in
 * <ModalOverlay> when the user navigates from inside the app, so
 * the detail page renders as an overlay over the still-mounted feed.
 * Direct URL loads bypass the interception and render the canonical
 * detail page without this wrapper.
 *
 * Dismiss paths (all call router.back() so the URL reverts to the
 * feed and Next.js unmounts the modal slot cleanly):
 *   - Click the backdrop outside the modal content
 *   - Press Escape
 *   - Click the X button
 */
export function ModalOverlay({ children }: { children: ReactNode }) {
  const router = useRouter()
  const dismiss = () => router.back()

  useEscapeKey(dismiss)
  useBodyScrollLock()

  // Defensive: ensure the modal scrolls into view on mount. Without
  // this, opening the modal from a scrolled-down feed could leave the
  // user looking at the same scroll position with the modal off-screen.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-sm"
      onClick={(e) => {
        // Only dismiss when the click hit the backdrop itself, not
        // bubbled from inner content.
        if (e.target === e.currentTarget) dismiss()
      }}
    >
      <button
        onClick={dismiss}
        title="Close (Esc)"
        aria-label="Close"
        className="fixed top-4 right-4 z-10 p-2 text-[#888] hover:text-[#efefef] transition-colors"
      >
        <X size={18} />
      </button>
      <div className="min-h-full">{children}</div>
    </div>
  )
}
