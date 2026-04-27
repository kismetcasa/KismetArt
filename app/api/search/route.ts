import { NextRequest, NextResponse } from 'next/server'
import { searchProfiles } from '@/lib/profile'
import { searchCollections } from '@/lib/kv'
import { searchMoments } from '@/lib/search'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) {
    return NextResponse.json({ users: [], collections: [], mints: [] })
  }
  const [users, collections, mints] = await Promise.all([
    searchProfiles(q),
    searchCollections(q),
    searchMoments(q),
  ])
  return NextResponse.json({ users, collections, mints })
}
