#!/usr/bin/env node
// One-shot: backfill both KV records the cover-mint synthesis path needs
// for a single legacy collection deployed before the field-level fixes
// shipped (e438700 added collection-meta.coverTokenId persistence; 2704bd0
// added the instrumentation-time moment-meta backfill — which still skips
// collections whose stored meta lacks coverTokenId, so the very first
// cover-mint slips through both nets).
//
// Two KV writes, both keyed off the same collection address:
//
//   1. kismetart:moment-meta:<addr>:<tokenId>
//        { creator: <artist EOA>, name: <collection name> }
//      Powers the timeline route's stitch override so cover-mint moments
//      get the correct creator.address despite inprocess attributing them
//      to the factory at deploy time.
//
//   2. kismetart:collection-meta:<addr>          (coverTokenId field merged in)
//      Gates lib/coverMomentSynthesis.ts. Without coverTokenId set, the
//      synthesis path is a no-op for this collection — which is the right
//      behavior for case #1 (collection-only deploys) but means a legacy
//      cover-mint collection has to opt back in explicitly.
//
// Usage:
//   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
//     node scripts/backfill-cover-moment.mjs <collection> [--creator 0x...] [--token 1] [--name "..."]
//
// Idempotent on both writes: moment-meta is skipped if already present;
// collection-meta is rewritten only if coverTokenId isn't already on the
// stored record (and even then preserves every other field).

import { Redis } from '@upstash/redis'

const argv = process.argv.slice(2)
const positional = []
const flags = {}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--creator' || a === '--token' || a === '--name') {
    flags[a.slice(2)] = argv[++i]
  } else if (a.startsWith('--')) {
    console.error(`unknown flag: ${a}`)
    process.exit(1)
  } else {
    positional.push(a)
  }
}

const collectionArg = positional[0]
if (!collectionArg) {
  console.error(
    'usage: node scripts/backfill-cover-moment.mjs <collection> [--creator 0x...] [--token 1] [--name "..."]',
  )
  process.exit(1)
}
if (!/^0x[a-fA-F0-9]{40}$/.test(collectionArg)) {
  console.error('collection must be a 0x-prefixed 40-char address')
  process.exit(1)
}
const collection = collectionArg.toLowerCase()
const tokenId = flags.token ?? '1'
if (!/^\d+$/.test(tokenId)) {
  console.error('token must be a numeric token id')
  process.exit(1)
}

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
if (!url || !token) {
  console.error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set')
  process.exit(1)
}
const redis = new Redis({ url, token })

const collectionMetaKey = `kismetart:collection-meta:${collection}`
const momentMetaKey = `kismetart:moment-meta:${collection}:${tokenId}`

const rawMeta = await redis.get(collectionMetaKey)
if (!rawMeta) {
  console.error(`no collection-meta found at ${collectionMetaKey}`)
  process.exit(1)
}
const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta

const name = flags.name ?? meta?.name
if (!name) {
  console.error('collection-meta has no name and --name not provided; aborting')
  process.exit(1)
}

const creatorArg = flags.creator ?? meta?.artist
if (!creatorArg) {
  console.error(
    'collection-meta has no artist and --creator not provided; pass --creator 0x... (the artist EOA)',
  )
  process.exit(1)
}
if (!/^0x[a-fA-F0-9]{40}$/.test(creatorArg)) {
  console.error('creator must be a 0x-prefixed 40-char address')
  process.exit(1)
}
const creator = creatorArg.toLowerCase()

// Write moment-meta first, then coverTokenId. Order matters: synthesis is
// gated on coverTokenId, so flipping it on AFTER the creator record exists
// guarantees the first synthesis-triggered read finds a properly attributed
// moment instead of falling back to collection-meta.artist (which is the
// same address in practice but a less specific signal).
const existing = await redis.get(momentMetaKey)
if (existing) {
  console.log('moment-meta already exists; skipping write', {
    key: momentMetaKey,
    existing,
  })
} else {
  const value = { creator, name }
  await redis.set(momentMetaKey, JSON.stringify(value))
  console.log('wrote moment-meta', { key: momentMetaKey, value })
}

if (meta.coverTokenId === tokenId) {
  console.log('collection-meta.coverTokenId already set; skipping write', {
    key: collectionMetaKey,
    coverTokenId: meta.coverTokenId,
  })
} else if (meta.coverTokenId && meta.coverTokenId !== tokenId) {
  console.error(
    `collection-meta.coverTokenId is already set to ${meta.coverTokenId} (expected ${tokenId}); refusing to overwrite`,
  )
  process.exit(1)
} else {
  const updated = { ...meta, coverTokenId: tokenId }
  await redis.set(collectionMetaKey, JSON.stringify(updated))
  console.log('wrote collection-meta with coverTokenId', {
    key: collectionMetaKey,
    coverTokenId: tokenId,
  })
}
