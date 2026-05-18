import { NextResponse } from 'next/server'

/**
 * Standard `{ error }` envelope for API routes. Routes that need extra
 * fields (AUTHORIZE_REQUIRED, upstream `detail`) build NextResponse directly.
 */
export function errorResponse(status: number, message: string): NextResponse {
  return NextResponse.json({ error: message }, { status })
}
