import { NextRequest, NextResponse } from 'next/server'

const INPROCESS_API = 'https://inprocess.world/api'

export async function POST(req: NextRequest) {
  const apiKey = process.env.INPROCESS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'INPROCESS_API_KEY not configured' }, { status: 500 })
  }

  const body = await req.json()

  const res = await fetch(`${INPROCESS_API}/moment/collect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
