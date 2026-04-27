'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Dancing_Script } from 'next/font/google'

const dancing = Dancing_Script({ subsets: ['latin'], weight: ['600'] })

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const ready = mounted
        const connected = ready && account && chain

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            })}
          >
            {!connected ? (
              <button
                onClick={openConnectModal}
                style={{
                  borderRadius: '9999px',
                  background: 'linear-gradient(135deg, #8B5CF6, #C084FC)',
                  fontFamily: dancing.style.fontFamily,
                  fontSize: '16px',
                  fontWeight: 600,
                  color: 'white',
                  padding: '7px 18px',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.01em',
                }}
              >
                connect wallet
              </button>
            ) : (
              <button
                onClick={openAccountModal}
                style={{
                  borderRadius: '9999px',
                  background: 'linear-gradient(#0d0d0d, #0d0d0d) padding-box, linear-gradient(135deg, #8B5CF6, #C084FC) border-box',
                  border: '1px solid transparent',
                  color: '#efefef',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontSize: '11px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.05em',
                }}
              >
                {account.displayName}
              </button>
            )}
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
