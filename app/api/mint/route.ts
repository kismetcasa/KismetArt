import { NextRequest, NextResponse } from 'next/server'

const INPROCESS_API = 'https://inprocess.world/api'

export async function POST(req: NextRequest) {
  const body = await req.json()

  // The create endpoint does not require an API key per inprocess docs.
  // Authentication is implicit: the `account` field must be an admin of the
  // target collection (or creating a new one).
  const res = await fetch(`${INPROCESS_API}/moment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
