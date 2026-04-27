import { NextRequest, NextResponse } from 'next/server'
import { INPROCESS_API } from '@/lib/inprocess'
import { trackWallet } from '@/lib/profile'

export async function POST(req: NextRequest) {
  const body = await req.json()
  if (body?.account) trackWallet(body.account)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = process.env.INPROCESS_API_KEY
  if (apiKey) headers['x-api-key'] = apiKey

  const res = await fetch(`${INPROCESS_API}/moment/create`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const text = await res.text()
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'upstream error', status: res.status, detail: text.slice(0, 200) }, { status: 502 })
  }
  return NextResponse.json(data, { status: res.status })
}
