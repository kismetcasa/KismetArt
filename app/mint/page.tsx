import { MintForm } from '@/components/MintForm'

export const metadata = {
  title: 'mint — Kismet Art',
  description: 'upload your work and mint it as a moment on Kismet Art',
}

export default function MintPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-xs font-mono text-[#888] uppercase tracking-widest mb-1">
          Mint
        </h1>
        <p className="text-xs font-mono text-[#555]">
          upload your work and publish it as a moment on Kismet Art
        </p>
      </div>
      <MintForm />
    </div>
  )
}
