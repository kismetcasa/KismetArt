import { NextRequest, NextResponse } from 'next/server'
import { createNonce } from '@/lib/profile'

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params
  const nonce = await createNonce(address)
  return NextResponse.json({ nonce })
}
