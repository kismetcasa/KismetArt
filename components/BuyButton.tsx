'use client'

import { useState } from 'react'
import { useAccount, useSignMessage, useWriteContract, usePublicClient } from 'wagmi'
import { base } from 'wagmi/chains'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { toast } from 'sonner'
import { formatEther } from 'viem'
import type { Hex } from 'viem'
import { SEAPORT_ADDRESS, SEAPORT_ABI, deserializeOrder } from '@/lib/seaport'
import type { Listing } from '@/lib/listings'
import { useEnsureBase } from '@/lib/useEnsureBase'

interface BuyButtonProps {
  listing: Listing
  onBought?: () => void
  className?: string
}

export function BuyButton({ listing, onBought, className = '' }: BuyButtonProps) {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const { writeContractAsync } = useWriteContract()
  const { signMessageAsync } = useSignMessage()
  const publicClient = usePublicClient()
  const ensureBase = useEnsureBase()
  const [loading, setLoading] = useState(false)
  const [bought, setBought] = useState(false)

  const priceWei = BigInt(listing.price)
  const eth = formatEther(priceWei).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')

  async function handleBuy() {
    if (!isConnected || !address) {
      openConnectModal?.()
      return
    }
    if (address.toLowerCase() === listing.seller.toLowerCase()) {
      toast.error("You can't buy your own listing")
      return
    }

    setLoading(true)
    toast.loading('Confirm purchase in wallet…', { id: 'buy' })

    try {
      await ensureBase()
      const order = deserializeOrder(listing.orderComponents)

      const hash = await writeContractAsync({
        chainId: base.id,
        address: SEAPORT_ADDRESS,
        abi: SEAPORT_ABI,
        functionName: 'fulfillOrder',
        value: priceWei,
        args: [
          {
            parameters: {
              offerer: order.offerer,
              zone: order.zone,
              offer: order.offer,
              consideration: order.consideration,
              orderType: order.orderType,
              startTime: order.startTime,
              endTime: order.endTime,
              zoneHash: order.zoneHash,
              salt: order.salt,
              conduitKey: order.conduitKey,
              totalOriginalConsiderationItems: BigInt(order.consideration.length),
            },
            signature: listing.signature as Hex,
          },
          '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex,
        ],
      })

      // Don't mark filled until the tx actually confirms — a reverted fulfillOrder
      // would leave the order open on-chain but our backend would say "sold".
      if (!publicClient) throw new Error('No RPC client available')
      toast.loading('Confirming purchase…', { id: 'buy' })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted on-chain')
      }

      // Mark filled — backend requires a signed message from the buyer so a
      // third party can't flip arbitrary listings or fake "sale" notifications.
      const nonceRes = await fetch(`/api/profile/${address}/nonce`)
      if (!nonceRes.ok) throw new Error('Could not fetch nonce')
      const { nonce } = (await nonceRes.json().catch(() => ({}))) as { nonce?: string }
      if (!nonce) throw new Error('Could not fetch nonce')
      const message = `Mark Kismet Art listing filled\nListing: ${listing.id}\nBuyer: ${address.toLowerCase()}\nNonce: ${nonce}`
      const signature = await signMessageAsync({ message })

      await fetch(`/api/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'filled', signature, nonce, signer: address }),
      })

      setBought(true)
      toast.success('Purchased!', { id: 'buy' })
      onBought?.()
    } catch (err) {
      toast.error('Purchase failed', {
        id: 'buy',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleBuy}
      disabled={loading || bought}
      className={`text-xs font-mono tracking-wider uppercase px-4 py-2.5 border transition-colors disabled:opacity-50 ${loading ? 'cursor-not-allowed' : ''} ${
        bought
          ? 'border-[#8B5CF6] text-[#8B5CF6] bg-[#8B5CF6]/10'
          : 'border-[#2a2a2a] text-[#888] hover:border-[#8B5CF6] hover:text-[#8B5CF6]'
      } ${className}`}
    >
      {bought ? 'bought' : loading ? 'buying…' : `buy ${eth} ETH`}
    </button>
  )
}
