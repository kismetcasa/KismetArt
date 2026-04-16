import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { base } from 'wagmi/chains'
import { http } from 'wagmi'

export const wagmiConfig = getDefaultConfig({
  appName: 'inprocess client',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'WALLETCONNECT_PROJECT_ID_REQUIRED',
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  ssr: true,
})
