'use client'

import { useState, useRef } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { toast } from 'sonner'
import { Upload, X, Plus, Trash2 } from 'lucide-react'
import { parseEther, isAddress } from 'viem'
import type { CreateMomentPayload, Split } from '@/lib/inprocess'
import uploadToArweave from '@/lib/arweave/uploadToArweave'
import { uploadJson } from '@/lib/arweave/uploadJson'

const PLATFORM_COLLECTION = process.env.NEXT_PUBLIC_PLATFORM_COLLECTION
const CREATE_REFERRAL = process.env.NEXT_PUBLIC_CREATE_REFERRAL ?? '0x0000000000000000000000000000000000000000'

interface MintFormProps {
  collectionAddress?: string
}

export function MintForm({ collectionAddress }: MintFormProps = {}) {
  const targetCollection = collectionAddress ?? PLATFORM_COLLECTION
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('0')
  const [splits, setSplits] = useState<Split[]>([])
  const [splitInput, setSplitInput] = useState({ address: '', pct: '' })
  const [step, setStep] = useState<'idle' | 'uploading-media' | 'uploading-metadata' | 'minting' | 'done'>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [result, setResult] = useState<{ hash: string; contractAddress: string; tokenId: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const splitsTotal = splits.reduce((s, r) => s + r.percentAllocation, 0)

  function addSplit() {
    const addr = splitInput.address.trim()
    const pct = parseFloat(splitInput.pct)
    if (!isAddress(addr)) { toast.error('Invalid address'); return }
    if (isNaN(pct) || pct <= 0 || pct > 100) { toast.error('Allocation must be 1–100'); return }
    if (splitsTotal + pct > 100) { toast.error('Total allocation exceeds 100%'); return }
    if (splits.some((s) => s.address === addr)) { toast.error('Address already added'); return }
    setSplits((prev) => [...prev, { address: addr, percentAllocation: pct }])
    setSplitInput({ address: '', pct: '' })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (!f) return
    if (preview) URL.revokeObjectURL(preview)
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function clearFile() {
    setFile(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault()

    if (!isConnected || !address) {
      openConnectModal?.()
      return
    }

    if (!file) {
      toast.error('Please select a file to mint')
      return
    }
    if (!name.trim()) {
      toast.error('Please enter a title')
      return
    }
    if (splits.length === 1) {
      toast.error('Splits require at least 2 recipients')
      return
    }
    if (splits.length > 1 && splitsTotal !== 100) {
      toast.error(`Split allocations must sum to 100% (currently ${splitsTotal}%)`)
      return
    }

    try {
      // 1. Upload media to Arweave
      setStep('uploading-media')
      setUploadProgress(0)
      toast.loading('Uploading media to Arweave…', { id: 'mint' })
      const mediaUri = await uploadToArweave(file, (pct) => {
        setUploadProgress(pct)
        toast.loading(`Uploading media… ${pct}%`, { id: 'mint' })
      })

      // 2. Upload metadata to Arweave
      setStep('uploading-metadata')
      setUploadProgress(0)
      toast.loading('Uploading metadata…', { id: 'mint' })
      const metadata = {
        name: name.trim(),
        description: description.trim(),
        image: mediaUri,
        ...(file.type.startsWith('video/') ? { animation_url: mediaUri } : {}),
      }
      const metadataUri = await uploadJson(metadata)

      // 3. Mint moment via inprocess API
      setStep('minting')
      toast.loading('Minting moment…', { id: 'mint' })

      const priceInWei = parseEther(price || '0').toString()
      const now = Math.floor(Date.now() / 1000)

      const payload: CreateMomentPayload = {
        contract: targetCollection
          ? { address: targetCollection }
          : {
              name: `${name.trim()} by ${address}`,
              uri: metadataUri,
            },
        token: {
          tokenMetadataURI: metadataUri,
          createReferral: CREATE_REFERRAL,
          salesConfig: {
            type: 'fixedPrice',
            pricePerToken: priceInWei,
            saleStart: String(now),
            saleEnd: '18446744073709551615',
          },
          mintToCreatorCount: 1,
          payoutRecipient: address,
        },
        account: address!,
        ...(splits.length >= 2 ? { splits } : {}),
      }

      const res = await fetch('/api/mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? data.message ?? 'Mint failed')

      setResult(data)
      setStep('done')
      toast.success('Minted!', { id: 'mint', description: `Token #${data.tokenId}` })
    } catch (err) {
      setStep('idle')
      setUploadProgress(0)
      toast.error('Mint failed', {
        id: 'mint',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const isBusy = step !== 'idle' && step !== 'done'

  if (step === 'done' && result) {
    return (
      <div className="border border-[#2a2a2a] p-8 text-center flex flex-col gap-6">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#d4f53c]/10 border border-[#d4f53c] flex items-center justify-center">
          <span className="text-[#d4f53c] text-xl">✓</span>
        </div>
        <div>
          <h3 className="text-[#efefef] font-mono text-sm mb-2">Moment minted</h3>
          <p className="text-[#888] text-xs font-mono">Token #{result.tokenId}</p>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href={`https://inprocess.world/collect/base:${result.contractAddress}/${result.tokenId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-[#d4f53c] hover:underline"
          >
            View on in•process →
          </a>
          <a
            href={`https://basescan.org/tx/${result.hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-[#555] hover:text-[#888]"
          >
            {result.hash.slice(0, 10)}…{result.hash.slice(-8)}
          </a>
        </div>
        <button
          onClick={() => {
            setStep('idle')
            setResult(null)
            clearFile()
            setName('')
            setDescription('')
            setPrice('0')
            setSplits([])
            setSplitInput({ address: '', pct: '' })
          }}
          className="text-xs font-mono text-[#888] hover:text-[#efefef] underline"
        >
          Mint another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleMint} className="flex flex-col gap-6">
      {/* File upload */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Media
        </label>
        {preview ? (
          <div className="relative aspect-square bg-[#111] border border-[#2a2a2a] overflow-hidden">
            {file?.type.startsWith('video/') ? (
              <video src={preview} className="w-full h-full object-cover" muted autoPlay loop playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="preview" className="w-full h-full object-cover" />
            )}
            <button
              type="button"
              onClick={clearFile}
              className="absolute top-2 right-2 w-7 h-7 bg-[#0d0d0d]/80 border border-[#2a2a2a] flex items-center justify-center hover:border-[#888]"
            >
              <X size={14} className="text-[#888]" />
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="aspect-square border border-dashed border-[#2a2a2a] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#888] transition-colors bg-[#111]"
          >
            <Upload size={24} className="text-[#555]" />
            <div className="text-center">
              <p className="text-xs font-mono text-[#555]">drop file or click to upload</p>
              <p className="text-xs font-mono text-[#333] mt-1">image, video, gif</p>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.gif"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Title */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Title <span className="text-[#d4f53c]">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="untitled"
          required
          className="w-full bg-[#111] border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555]"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="describe your work…"
          rows={3}
          className="w-full bg-[#111] border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555] resize-none"
        />
      </div>

      {/* Price */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Price (ETH)
        </label>
        <div className="relative">
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            min="0"
            step="0.001"
            className="w-full bg-[#111] border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555] pr-16"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#555]">ETH</span>
        </div>
        {price === '0' && (
          <p className="text-xs text-[#555] font-mono mt-1">Free mint (open edition)</p>
        )}
      </div>

      {/* Revenue splits */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Revenue Splits
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={splitInput.address}
            onChange={(e) => setSplitInput((s) => ({ ...s, address: e.target.value }))}
            placeholder="0x… address"
            className="flex-1 bg-[#111] border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555]"
          />
          <input
            type="number"
            value={splitInput.pct}
            onChange={(e) => setSplitInput((s) => ({ ...s, pct: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSplit() } }}
            placeholder="%"
            min="1"
            max="100"
            className="w-16 bg-[#111] border border-[#2a2a2a] px-2 py-2.5 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555]"
          />
          <button
            type="button"
            onClick={addSplit}
            className="px-3 border border-[#2a2a2a] text-[#888] hover:border-[#555] hover:text-[#efefef] transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
        {splits.length > 0 && (
          <ul className="flex flex-col gap-1 mb-2">
            {splits.map((s) => (
              <li key={s.address} className="flex items-center justify-between bg-[#111] border border-[#2a2a2a] px-3 py-2">
                <span className="text-xs font-mono text-[#888] truncate">{s.address}</span>
                <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                  <span className="text-xs font-mono text-[#efefef]">{s.percentAllocation}%</span>
                  <button
                    type="button"
                    onClick={() => setSplits((prev) => prev.filter((r) => r.address !== s.address))}
                    className="text-[#555] hover:text-[#888]"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {splits.length > 0 && (
          <p className={`text-xs font-mono ${splitsTotal === 100 ? 'text-[#555]' : 'text-[#d4f53c]'}`}>
            {splitsTotal}% allocated{splitsTotal < 100 ? ` — ${100 - splitsTotal}% remaining` : ' ✓'}
          </p>
        )}
        {splits.length === 0 && (
          <p className="text-xs text-[#555] font-mono">
            optional — split primary sale proceeds among multiple addresses
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isBusy}
        className="w-full py-3 border border-[#d4f53c] text-[#d4f53c] text-xs font-mono tracking-widest uppercase hover:bg-[#d4f53c] hover:text-[#0d0d0d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {!isConnected
          ? 'connect wallet to mint'
          : isBusy
          ? stepLabel(step, uploadProgress)
          : 'mint'}
      </button>

      {!targetCollection && (
        <p className="text-xs font-mono text-[#555] text-center">
          No platform collection set — each mint creates a new collection
        </p>
      )}
    </form>
  )
}

function stepLabel(step: string, progress: number): string {
  switch (step) {
    case 'uploading-media': return progress > 0 ? `uploading media… ${progress}%` : 'uploading media…'
    case 'uploading-metadata': return 'uploading metadata…'
    case 'minting': return 'minting…'
    default: return 'working…'
  }
}
