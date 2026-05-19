import { createConfig, http } from 'wagmi'
import { createClient } from 'viem'
import { base, mainnet } from 'wagmi/chains'
import { connectorsForWallets, getDefaultWallets } from '@rainbow-me/rainbowkit'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

// Warn-and-continue rather than throw: Next.js prerenders the root
// layout's Providers tree during `Collecting page data`, and env vars
// aren't always populated at that step. Throwing here would kill the
// build for any route that touches the layout. A placeholder keeps
// build green; if the real ID is genuinely missing in prod, RainbowKit
// surfaces the misconfig the moment a wallet UI mounts.
if (!projectId) {
  console.warn(
    '[wagmi] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID not set — wallet connect will not work at runtime',
  )
}

// Manual config (rather than RainbowKit's `getDefaultConfig`) is required
// because we need to prepend a non-RainbowKit connector — the Farcaster
// Mini App connector — to the connectors array. RainbowKit's wallet list
// is preserved via getDefaultWallets() → connectorsForWallets() so the
// regular-web UX is unchanged: same modal, same wallet options.
const { wallets } = getDefaultWallets()
const rainbowKitConnectors = connectorsForWallets(wallets, {
  appName: 'Kismet',
  projectId: projectId ?? 'placeholder-build-only',
})

export const wagmiConfig = createConfig({
  chains: [base, mainnet],
  // Farcaster connector FIRST so wagmi's reconnect-on-mount tries it
  // before any RainbowKit wallet. Its `isAuthorized()` returns true
  // only inside a Mini App host (eth_accounts resolves to the host
  // wallet) and false everywhere else, so on regular web wagmi falls
  // through to whichever wallet the user last connected via the
  // RainbowKit modal — no behavior change for existing web users.
  connectors: [farcasterMiniApp(), ...rainbowKitConnectors],
  // Per-chain `client` factory (instead of the simpler `transports` map)
  // because we need Multicall3 batching on Base — that option lives on
  // the viem Client, not the http transport. Multicall3 coalesces all
  // eth_call reads issued in the same tick into ONE on-chain multicall,
  // returned via ONE RPC roundtrip. The discover page mounts dozens of
  // MomentCards on the Featured tab, each running 1-2 useReadContract
  // calls (balanceOf + getTokenInfo) on mount — without batching,
  // that's 30-100 sequential HTTPS requests fighting for the mobile
  // main thread, which on a Mini App webview reads as multi-second lag
  // before the first card resolves its supply/owned state. Multicall3
  // is deployed at the canonical address on Base and wagmi/chains has
  // the chain's multicall3 contract baked in, so this is a zero-config
  // toggle on our side. JSON-RPC batching at the transport level adds
  // a second layer of coalescing for any non-eth_call traffic.
  client({ chain }) {
    if (chain.id === base.id) {
      return createClient({
        chain,
        transport: http(process.env.NEXT_PUBLIC_BASE_RPC_URL, {
          batch: { batchSize: 1024, wait: 16 },
        }),
        batch: { multicall: { batchSize: 1024, wait: 16 } },
      })
    }
    // Mainnet is included solely for client-side ENS resolution via
    // useEnsName — few enough calls per page that batching isn't worth
    // configuring. Match the previous behavior (plain http transport).
    return createClient({
      chain,
      transport: http(process.env.NEXT_PUBLIC_MAINNET_RPC_URL),
    })
  },
  ssr: true,
})
