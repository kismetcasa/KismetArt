import { NextRequest, NextResponse } from 'next/server'
import { verifyMessage, isAddress, createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { Redis } from '@upstash/redis'
import { getProfile, upsertProfile, consumeNonce } from '@/lib/profile'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const mainnetClient = createPublicClient({ chain: mainnet, transport: http() })

async function resolveEns(address: string): Promise<string | null> {
  const key = `kismetart:ens:${address.toLowerCase()}`
  try {
    const cached = await redis.get<string>(key)
    if (cached !== null) return cached || null  // '' stored means no ENS
  } catch {}
  try {
    const name = await mainnetClient.getEnsName({ address: address as `0x${string}` })
    await redis.set(key, name ?? '', { ex: 3600 })
    return name ?? null
  } catch {
    return null
  }
}

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const profile = await getProfile(address)
  if (!profile.username) {
    const ensName = await resolveEns(address)
    if (ensName) return NextResponse.json({ profile: { ...profile, ensName } })
  }
  return NextResponse.json({ profile })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const body = await req.json() as { username?: string; avatarUrl?: string; signature: string; nonce: string }

  if (!body.signature || !body.nonce) {
    return NextResponse.json({ error: 'signature and nonce required' }, { status: 400 })
  }

  // Verify the nonce was issued for this address and hasn't been used
  const valid = await consumeNonce(address, body.nonce)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 })
  }

  // Verify the signature proves ownership of the address
  const message = `Update Kismet Art profile\nAddress: ${address.toLowerCase()}\nNonce: ${body.nonce}`
  const verified = await verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: body.signature as `0x${string}`,
  })

  if (!verified) {
    return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 })
  }

  const username = body.username?.trim().slice(0, 30) || undefined
  const profile = await upsertProfile(address, { username, avatarUrl: body.avatarUrl })
  return NextResponse.json({ profile })
}
