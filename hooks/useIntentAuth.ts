'use client'

import { useCallback } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'
import {
  buildMintIntent,
  KISMET_INTENT_DOMAIN,
  MINT_INTENT_TYPES,
  type IntentAction,
  type IntentEnvelope,
  type MintBody,
} from '@/lib/intent'

interface SignMintIntentResult {
  intent: IntentEnvelope
  /** Echoed so the caller can spread it into the request body. */
  account: string
}

/**
 * Client-side per-action intent signer using EIP-712 typed data. Pairs
 * with /api/auth/intent-nonce (issuer) and lib/intentAuth.verifyIntent
 * (server verifier). One wallet prompt produces a signature bound to the
 * exact mint/write body — every economically-relevant field is its own
 * typed slot, so newline / control-character injection into a value can't
 * shift what the user "sees" vs what the server enforces. The domain
 * separator also pins the signature to chainId 8453 (Base), so a signed
 * intent obtained on a phishing site for a different chain is rejected.
 *
 * Replay-safe: nonce is single-use server-side, consumed only after a
 * successful verification. Action-bound (mint vs write) via the typed
 * `action` field, so a write-signature can't be replayed as a mint.
 */
export function useIntentAuth() {
  const { address } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()

  const signMintIntent = useCallback(
    async (
      body: MintBody,
      action: IntentAction = 'mint',
    ): Promise<SignMintIntentResult> => {
      if (!address) throw new Error('Wallet not connected')

      const nonceRes = await fetch('/api/auth/intent-nonce', { method: 'POST' })
      if (!nonceRes.ok) throw new Error('Failed to obtain intent nonce')
      const { nonce, expiresAt } = (await nonceRes.json()) as {
        nonce: string
        expiresAt: number
      }

      const message = buildMintIntent(
        { ...body, account: address },
        action,
        nonce,
        expiresAt,
      )

      const signature = await signTypedDataAsync({
        domain: KISMET_INTENT_DOMAIN,
        types: MINT_INTENT_TYPES,
        primaryType: 'MintIntent',
        message,
      })

      return {
        intent: { signature, nonce, expiresAt },
        account: address,
      }
    },
    [address, signTypedDataAsync],
  )

  return { signMintIntent }
}
