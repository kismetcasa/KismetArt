#!/usr/bin/env node
// One-time migration: copy `kismetart:created-collections` (SET) into the
// new `kismetart:created-collections-z` (ZSET) so the discover feed can
// propagate newest-first. Legacy entries have no real deploy timestamp;
// we stamp Date.now() minus an index offset so they're below any future
// real-time insertion and stay in a stable arbitrary order amongst
// themselves.
//
// Idempotent: ZADD NX skips members that already exist in the destination,
// so re-runs are safe (and a no-op after the first successful run).
//
// Usage:
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//     node scripts/migrate-created-collections-zset.mjs [--dry-run]
//
// The old SET key is preserved on purpose — verify the new ZSET looks
// right (ZRANGE rev=true, ZCARD), then drop manually with:
//   redis-cli DEL kismetart:created-collections

import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
if (!url || !token) {
  console.error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set')
  process.exit(1)
}

const SRC = 'kismetart:created-collections'
const DST = 'kismetart:created-collections-z'

const dryRun = process.argv.includes('--dry-run')

const redis = new Redis({ url, token })

const members = await redis.smembers(SRC)
console.log(`[migrate] SRC ${SRC}: ${members.length} members`)

const existingDst = await redis.zcard(DST)
console.log(`[migrate] DST ${DST}: ${existingDst} existing members`)

if (members.length === 0) {
  console.log('[migrate] nothing to copy')
  process.exit(0)
}

// Anchor at a fixed past timestamp so legacy entries sort below any
// real-time insertion that happens between the script run and full
// cutover. Sub-ms offsets per index keep deterministic ordering.
const anchor = Date.now() - 24 * 60 * 60 * 1000 // 24h ago
const pairs = members.map((member, i) => ({
  score: anchor - i,
  member,
}))

if (dryRun) {
  console.log('[migrate] DRY RUN — would ZADD NX:')
  for (const p of pairs) console.log(`  ${p.score}  ${p.member}`)
  process.exit(0)
}

// ZADD NX skips members that already exist — safe to re-run.
const added = await redis.zadd(DST, { nx: true }, ...pairs)
console.log(`[migrate] ZADD NX: ${added} new members written to ${DST}`)

const finalCard = await redis.zcard(DST)
console.log(`[migrate] DST ${DST}: ${finalCard} total members after migration`)
