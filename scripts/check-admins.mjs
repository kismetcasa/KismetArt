#!/usr/bin/env node
// Probes a list of addresses on Base to classify each as either a contract
// (has bytecode) or an EOA. Useful for diagnosing the moment "splits" panel
// when a moment's `momentAdmins[]` includes addresses that link to empty
// profile pages — contracts in that list are typically the deployed 0xSplits
// SplitWallet, and EOAs are usually the operator smart wallet or a real
// recipient.
//
// Usage:
//   node scripts/check-admins.mjs 0xabc... 0xdef...
//
// Reads NEXT_PUBLIC_BASE_RPC_URL when set so the run uses the same RPC the
// app is configured with; otherwise falls through to viem's default Base
// transport.
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'

const addresses = process.argv.slice(2)
if (addresses.length === 0) {
  console.error('usage: node scripts/check-admins.mjs <addr> [<addr> ...]')
  process.exit(1)
}

const client = createPublicClient({
  chain: base,
  transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
})

const results = []
for (const addr of addresses) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    results.push({ addr, error: 'not a valid 0x address' })
    continue
  }
  try {
    const code = await client.getCode({ address: addr })
    const isContract = !!code && code !== '0x' && code.length > 2
    results.push({ addr, kind: isContract ? 'contract' : 'eoa', codeLen: code?.length ?? 0 })
  } catch (err) {
    results.push({ addr, error: err.message })
  }
}

console.log(JSON.stringify(results, null, 2))
