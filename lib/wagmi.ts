import { connectorsForWallets } from '@rainbow-me/rainbowkit'
import {
  injectedWallet,
  metaMaskWallet,
  baseAccount,
  rabbyWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { createConfig, http } from 'wagmi'
import { base } from 'wagmi/chains'

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Wallets',
      wallets: [
        injectedWallet,
        metaMaskWallet,
        baseAccount,
        rabbyWallet,
      ],
    },
  ],
  {
    appName: 'inprocess client',
    // projectId is required by the type signature but is only consumed by
    // walletConnectWallet, which is not included above.
    projectId: 'inprocess-client',
  }
)

export const wagmiConfig = createConfig({
  connectors,
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
})
