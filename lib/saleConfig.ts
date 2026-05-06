import type { Address, Chain, Client, Transport } from 'viem'
import { multicall } from 'viem/actions'
import { ZORA_FIXED_PRICE_STRATEGY } from './zoraMint'

// FixedPriceSaleStrategy.sale(target, tokenId) — the canonical view returning
// the SalesConfig struct (see zora protocol-deployments). Tokens whose sale
// row is unset return zeros, which we treat as "no ETH sale configured".
const FPSS_SALE_ABI = [
  {
    name: 'sale',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'saleStart', type: 'uint64' },
          { name: 'saleEnd', type: 'uint64' },
          { name: 'maxTokensPerAddress', type: 'uint64' },
          { name: 'pricePerToken', type: 'uint96' },
          { name: 'fundsRecipient', type: 'address' },
        ],
      },
    ],
  },
] as const

const ERC1155_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const

// ZoraCreator1155Impl.getTokenInfo(tokenId) — used to filter out tokens whose
// totalMinted has hit maxSupply (mint() would revert). maxSupply === 0 is
// Zora's convention for "unlimited".
const ZORA_TOKEN_INFO_ABI = [
  {
    name: 'getTokenInfo',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'uri', type: 'string' },
          { name: 'maxSupply', type: 'uint256' },
          { name: 'totalMinted', type: 'uint256' },
        ],
      },
    ],
  },
] as const

export interface EligibleToken {
  tokenId: bigint
  pricePerToken: bigint
  maxPerAddress: bigint
}

// Generic over chain so callers can pass the wagmi-typed client (Base) or
// a server-side createPublicClient without re-typing.
type AnyClient = Client<Transport, Chain | undefined>

/**
 * Filter `tokenIds` down to those currently mintable via FixedPriceSaleStrategy
 * (the ETH path) on `collection`. When `account` is provided, additionally
 * skip tokens where balance > 0 and maxPerAddress === 1 — those would revert
 * a multicall batch. Returns [] on read failure so callers stay simple.
 *
 * Two RPC round trips: one multicall for sale configs, one for balances.
 */
export async function fetchEthEligibleTokens(
  client: AnyClient,
  collection: Address,
  tokenIds: bigint[],
  account?: Address,
): Promise<EligibleToken[]> {
  if (tokenIds.length === 0) return []

  const now = BigInt(Math.floor(Date.now() / 1000))

  // First pass: read sale config + token info for every candidate in one
  // multicall. Even-indexed slot is the sale read; odd is getTokenInfo.
  let firstPass
  try {
    firstPass = await multicall(client, {
      contracts: tokenIds.flatMap((id) => [
        {
          address: ZORA_FIXED_PRICE_STRATEGY,
          abi: FPSS_SALE_ABI,
          functionName: 'sale' as const,
          args: [collection, id] as const,
        },
        {
          address: collection,
          abi: ZORA_TOKEN_INFO_ABI,
          functionName: 'getTokenInfo' as const,
          args: [id] as const,
        },
      ]),
      allowFailure: true,
    })
  } catch {
    return []
  }

  const candidates: EligibleToken[] = []
  for (let i = 0; i < tokenIds.length; i++) {
    const saleRes = firstPass[2 * i]
    const infoRes = firstPass[2 * i + 1]
    if (saleRes.status !== 'success' || !saleRes.result) continue
    const sale = saleRes.result as {
      saleStart: bigint
      saleEnd: bigint
      maxTokensPerAddress: bigint
      pricePerToken: bigint
    }
    if (sale.saleEnd === 0n) continue
    if (sale.saleEnd <= now) continue
    if (sale.saleStart > now) continue

    // Skip sold-out tokens. allowFailure means non-Zora-1155 contracts (or
    // older versions without getTokenInfo) just opt out of this check —
    // the mint will revert at submit time as a fallback.
    if (infoRes.status === 'success' && infoRes.result) {
      const info = infoRes.result as { maxSupply: bigint; totalMinted: bigint }
      if (info.maxSupply > 0n && info.totalMinted >= info.maxSupply) continue
    }

    candidates.push({
      tokenId: tokenIds[i],
      pricePerToken: sale.pricePerToken,
      maxPerAddress: sale.maxTokensPerAddress,
    })
  }

  if (!account || candidates.length === 0) return candidates

  // Second pass: per-account balance check to skip tokens already saturated.
  // maxPerAddress === 0 means unlimited (no filter); otherwise filter when
  // balance has hit the cap. Covers single-edition (=== 1) AND multi-edition
  // ceilings — minting +1 over the cap reverts atomically.
  let balanceResults
  try {
    balanceResults = await multicall(client, {
      contracts: candidates.map((c) => ({
        address: collection,
        abi: ERC1155_BALANCE_ABI,
        functionName: 'balanceOf' as const,
        args: [account, c.tokenId] as const,
      })),
      allowFailure: true,
    })
  } catch {
    return candidates
  }

  return candidates.filter((c, i) => {
    const r = balanceResults[i]
    if (r.status !== 'success') return true
    const balance = r.result as bigint
    return !(c.maxPerAddress > 0n && balance >= c.maxPerAddress)
  })
}
