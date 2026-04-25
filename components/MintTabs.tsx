'use client'

import { useState } from 'react'
import { MintForm } from '@/components/MintForm'
import { CreateCollectionForm } from '@/components/CreateCollectionForm'

type Tab = 'mint' | 'create'

export function MintTabs() {
  const [tab, setTab] = useState<Tab>('mint')
  const [deployedCollection, setDeployedCollection] = useState<{ address: string; name: string } | null>(null)

  function handleDeployed(address: string, name: string) {
    setDeployedCollection({ address, name })
    setTab('mint')
  }

  return (
    <div>
      <div className="flex gap-1 mb-8 border-b border-[#2a2a2a] pb-px">
        <button
          onClick={() => setTab('mint')}
          className={`px-4 py-2 text-xs font-mono tracking-wider uppercase transition-colors border-b-2 -mb-px ${
            tab === 'mint'
              ? 'border-[#7C3AED] text-[#7C3AED]'
              : 'border-transparent text-[#888] hover:text-[#efefef]'
          }`}
        >
          Mint
        </button>
        <button
          onClick={() => setTab('create')}
          className={`px-4 py-2 text-xs font-mono tracking-wider uppercase transition-colors border-b-2 -mb-px ${
            tab === 'create'
              ? 'border-[#7C3AED] text-[#7C3AED]'
              : 'border-transparent text-[#888] hover:text-[#efefef]'
          }`}
        >
          Create Collection
        </button>
      </div>

      {tab === 'mint' && (
        <>
          {deployedCollection && (
            <div className="mb-6 p-3 border border-[#7C3AED]/30 bg-[#7C3AED]/5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-mono text-[#7C3AED]">minting into: {deployedCollection.name}</p>
                <p className="text-xs font-mono text-[#555] mt-0.5 break-all">{deployedCollection.address}</p>
              </div>
              <button
                onClick={() => setDeployedCollection(null)}
                className="text-xs font-mono text-[#555] hover:text-[#888] whitespace-nowrap underline"
              >
                clear
              </button>
            </div>
          )}
          <MintForm collectionAddress={deployedCollection?.address} />
        </>
      )}

      {tab === 'create' && (
        <CreateCollectionForm onDeployed={handleDeployed} />
      )}
    </div>
  )
}
