'use client'

import { useState, useRef, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { parseEventLogs } from 'viem'
import { toast } from 'sonner'
import { Upload, X } from 'lucide-react'
import { FACTORY_ADDRESS, FACTORY_ABI } from '@/lib/collections'
import uploadToArweave from '@/lib/arweave/uploadToArweave'
import { uploadJson } from '@/lib/arweave/uploadJson'

// kismetcasa.eth — referral address credited on each mint from this collection
const CREATE_REFERRAL = process.env.NEXT_PUBLIC_CREATE_REFERRAL ?? '0x0000000000000000000000000000000000000000'

export function CreateCollectionForm() {
  const { address, isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()

  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [royaltyBps, setRoyaltyBps] = useState('500')
  const [step, setStep] = useState<'idle' | 'uploading-image' | 'uploading-metadata' | 'deploying' | 'done'>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [collectionAddress, setCollectionAddress] = useState<string | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const { writeContractAsync } = useWriteContract()

  const { data: receipt } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash && step === 'deploying' },
  })

  useEffect(() => {
    if (!receipt || step !== 'deploying') return
    if (receipt.status === 'reverted') {
      setStep('idle')
      setTxHash(undefined)
      toast.error('Transaction reverted', { id: 'create-collection', description: 'The deploy transaction failed on-chain.' })
      return
    }
    const logs = parseEventLogs({
      abi: FACTORY_ABI,
      eventName: 'SetupNewContract',
      logs: receipt.logs,
    })
    const found = logs[0]?.args?.newContract as string | undefined
    setCollectionAddress(found ?? receipt.logs[0]?.address ?? null)
    setStep('done')
    toast.success('Collection deployed!', { id: 'create-collection' })
  }, [receipt, step])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverFile(f)
    setCoverPreview(URL.createObjectURL(f))
  }

  function clearFile() {
    setCoverFile(null)
    if (coverPreview) URL.revokeObjectURL(coverPreview)
    setCoverPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()

    if (!isConnected || !address) {
      openConnectModal?.()
      return
    }
    if (!name.trim()) {
      toast.error('Please enter a collection name')
      return
    }

    try {
      let imageUri: string | undefined

      if (coverFile) {
        setStep('uploading-image')
        setUploadProgress(0)
        toast.loading('Uploading cover image…', { id: 'create-collection' })
        imageUri = await uploadToArweave(coverFile, (pct) => {
          setUploadProgress(pct)
          toast.loading(`Uploading image… ${pct}%`, { id: 'create-collection' })
        })
      }

      setStep('uploading-metadata')
      toast.loading('Uploading collection metadata…', { id: 'create-collection' })
      const metadata: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim(),
        ...(imageUri ? { image: imageUri } : {}),
        createReferral: CREATE_REFERRAL,
      }
      const contractURI = await uploadJson(metadata)

      setStep('deploying')
      toast.loading('Deploying collection…', { id: 'create-collection' })

      const bps = Math.max(0, Math.min(10000, parseInt(royaltyBps, 10) || 0))

      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: 'createContract',
        args: [
          contractURI,
          name.trim(),
          {
            royaltyMintSchedule: 0,
            royaltyBPS: bps,
            royaltyRecipient: address,
          },
          address,
          [],
        ],
      })

      setTxHash(hash)
    } catch (err) {
      setStep('idle')
      setUploadProgress(0)
      toast.error('Deploy failed', {
        id: 'create-collection',
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  const isBusy = step !== 'idle' && step !== 'done'

  if (step === 'done' && collectionAddress) {
    return (
      <div className="border border-[#2a2a2a] p-8 text-center flex flex-col gap-6">
        <div className="w-12 h-12 mx-auto rounded-full bg-[#d4f53c]/10 border border-[#d4f53c] flex items-center justify-center">
          <span className="text-[#d4f53c] text-xl">✓</span>
        </div>
        <div>
          <h3 className="text-[#efefef] font-mono text-sm mb-2">Collection deployed</h3>
          <p className="text-[#888] text-xs font-mono break-all">{collectionAddress}</p>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href={`https://inprocess.world/collect/base:${collectionAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono text-[#d4f53c] hover:underline"
          >
            View on in•process →
          </a>
          {txHash && (
            <a
              href={`https://basescan.org/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-[#555] hover:text-[#888]"
            >
              {txHash.slice(0, 10)}…{txHash.slice(-8)}
            </a>
          )}
        </div>
        <button
          onClick={() => {
            setStep('idle')
            setCollectionAddress(null)
            setTxHash(undefined)
            clearFile()
            setName('')
            setDescription('')
            setRoyaltyBps('500')
          }}
          className="text-xs font-mono text-[#888] hover:text-[#efefef] underline"
        >
          Create another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleCreate} className="flex flex-col gap-6">
      {/* Cover image */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Cover Image
        </label>
        {coverPreview ? (
          <div className="relative aspect-video bg-[#111] border border-[#2a2a2a] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverPreview} alt="cover preview" className="w-full h-full object-cover" />
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
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (!f) return
              if (coverPreview) URL.revokeObjectURL(coverPreview)
              setCoverFile(f)
              setCoverPreview(URL.createObjectURL(f))
            }}
            onDragOver={(e) => e.preventDefault()}
            className="aspect-video border border-dashed border-[#2a2a2a] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[#888] transition-colors bg-[#111]"
          >
            <Upload size={24} className="text-[#555]" />
            <div className="text-center">
              <p className="text-xs font-mono text-[#555]">drop image or click to upload</p>
              <p className="text-xs font-mono text-[#333] mt-1">optional cover image</p>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.gif"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Collection name */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Collection Name <span className="text-[#d4f53c]">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my collection"
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
          placeholder="describe your collection…"
          rows={3}
          className="w-full bg-[#111] border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555] resize-none"
        />
      </div>

      {/* Royalty */}
      <div>
        <label className="block text-xs font-mono text-[#888] uppercase tracking-wider mb-2">
          Royalty (%)
        </label>
        <div className="relative">
          <input
            type="number"
            value={royaltyBps === '0' ? '' : String(parseInt(royaltyBps, 10) / 100)}
            onChange={(e) => {
              const pct = parseFloat(e.target.value) || 0
              setRoyaltyBps(String(Math.round(pct * 100)))
            }}
            min="0"
            max="100"
            step="0.5"
            placeholder="5"
            className="w-full bg-[#111] border border-[#2a2a2a] px-3 py-2.5 text-sm text-[#efefef] font-mono placeholder-[#333] focus:outline-none focus:border-[#555] pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#555]">%</span>
        </div>
        <p className="text-xs text-[#555] font-mono mt-1">paid to your wallet on secondary sales</p>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isBusy}
        className="w-full py-3 border border-[#d4f53c] text-[#d4f53c] text-xs font-mono tracking-widest uppercase hover:bg-[#d4f53c] hover:text-[#0d0d0d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {!isConnected
          ? 'connect wallet to deploy'
          : isBusy
          ? stepLabel(step, uploadProgress)
          : 'deploy collection'}
      </button>
    </form>
  )
}

function stepLabel(step: string, progress: number): string {
  switch (step) {
    case 'uploading-image': return progress > 0 ? `uploading image… ${progress}%` : 'uploading image…'
    case 'uploading-metadata': return 'uploading metadata…'
    case 'deploying': return 'deploying…'
    default: return 'working…'
  }
}
