import { CreateCollectionForm } from '@/components/CreateCollectionForm'

export const metadata = {
  title: 'create collection — in•process client',
  description: 'deploy a new 1155 collection on Base via the in•process factory',
}

export default function CreateCollectionPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-xs font-mono text-[#888] uppercase tracking-widest mb-1">
          Create Collection
        </h1>
        <p className="text-xs font-mono text-[#555]">
          deploy a new 1155 collection on Base and start minting moments into it
        </p>
      </div>
      <CreateCollectionForm />
    </div>
  )
}
