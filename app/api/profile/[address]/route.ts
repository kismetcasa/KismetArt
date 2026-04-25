import { NextRequest, NextResponse } from 'next/server'
import { verifyMessage, isAddress } from 'viem'
import { getProfile, upsertProfile, consumeNonce } from '@/lib/profile'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }
  const profile = await getProfile(address)
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

  const body = await req.json() as { avatarUrl?: string; signature: string; nonce: string }

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

  const profile = await upsertProfile(address, { avatarUrl: body.avatarUrl })
  return NextResponse.json({ profile })
}
