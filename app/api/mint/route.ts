import { NextRequest, NextResponse } from 'next/server'

const INPROCESS_API = 'https://inprocess.world/api'

export async function POST(req: NextRequest) {
  const body = await req.json()

  // The create endpoint does not require an API key per inprocess docs.
  // Authentication is implicit: the `account` field must be an admin of the
  // target collection (or creating a new one).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Origin': 'https://inprocess.world',
    'Referer': 'https://inprocess.world/',
  }
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
