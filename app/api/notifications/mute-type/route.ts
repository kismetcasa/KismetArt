import { NextRequest, NextResponse } from 'next/server'
import {
  muteType,
  unmuteType,
  getMutedTypes,
  NON_MUTEABLE_TYPES,
  type NotificationType,
} from '@/lib/notifications'
import { checkRateLimit, getClientIp } from '@/lib/ratelimit'
import { getSessionContext, slideSession } from '@/lib/session'

// Types the user is allowed to silence. `sale`, `airdrop`, `payout` are
// excluded — those are money-bearing signals; the UI hides them too but the
// server is the enforcing boundary.
const MUTEABLE_TYPES: NotificationType[] = [
  'collect',
  'follow',
  'mint',
  'listing_expired',
  'listing_created',
  'authorized',
]

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const allowed = await checkRateLimit(`notif-mute-type-get:${ip}`, 60, 60)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const ctx = await getSessionContext(req)
  if (!ctx) return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })

  const muted = await getMutedTypes(ctx.address)
  const res = NextResponse.json(
    { muted, muteable: MUTEABLE_TYPES },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
  await slideSession(res, ctx.token)
  return res
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const allowed = await checkRateLimit(`notif-mute-type:${ip}`, 30, 60)
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const ctx = await getSessionContext(req)
  if (!ctx) return NextResponse.json({ error: 'Sign in to continue' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { type?: string; unmute?: boolean } | null
  if (!body || typeof body.type !== 'string') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }
  const type = body.type as NotificationType
  if (NON_MUTEABLE_TYPES.has(type)) {
    return NextResponse.json({ error: 'This type cannot be muted' }, { status: 400 })
  }
  if (!MUTEABLE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Unknown notification type' }, { status: 400 })
  }

  if (body.unmute) {
    await unmuteType(ctx.address, type)
  } else {
    await muteType(ctx.address, type)
  }

  const res = NextResponse.json({ ok: true })
  await slideSession(res, ctx.token)
  return res
}
