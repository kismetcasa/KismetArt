'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useUploadSession } from '@/hooks/useUploadSession'
import { humanError } from '@/lib/toast'

interface SignInPromptProps {
  /** Helper text shown above the button. Default: "sign in to continue". */
  message?: string
  /**
   * Fires after the SIWE flow resolves successfully. The caller is
   * expected to clear whatever local `authRequired` state triggered
   * this prompt and re-run the fetch that originally 401'd. The
   * component intentionally doesn't own that state — the surface that
   * detected the 401 is the only one that knows what to retry.
   */
  onSignedIn: () => void
}

/**
 * Inline sign-in CTA for wallet-connected users who hit a 401 on a
 * session-cookie-required endpoint. Wraps the SIWE flow from
 * useUploadSession (ensureSession) plus in-flight tracking + error
 * toasting, so each consumer just renders <SignInPrompt /> in its
 * own auth-required empty state instead of duplicating the handler.
 *
 * In a Mini App context ensureSession is a no-op (Quick Auth's JWT
 * is the session), so clicking the button there resolves
 * immediately and triggers the caller's onSignedIn — the only
 * observable difference vs. a successful web SIWE is the absence of
 * the wallet signature prompt.
 */
export function SignInPrompt({
  message = 'sign in to continue',
  onSignedIn,
}: SignInPromptProps) {
  const { ensureSession } = useUploadSession()
  const [signingIn, setSigningIn] = useState(false)

  async function handleClick() {
    if (signingIn) return
    setSigningIn(true)
    try {
      await ensureSession()
      onSignedIn()
    } catch (err) {
      toast.error('Sign in failed', { description: humanError(err) })
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <p className="text-xs font-mono text-muted">{message}</p>
      <button
        onClick={handleClick}
        disabled={signingIn}
        className="px-4 py-1.5 text-xs font-mono border border-line text-dim hover:text-ink hover:border-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {signingIn ? 'signing…' : 'sign in'}
      </button>
    </div>
  )
}
