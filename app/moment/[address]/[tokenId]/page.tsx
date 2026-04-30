import type { Metadata } from 'next'
import { INPROCESS_API, resolveUri } from '@/lib/inprocess'
import { MomentDetailView } from '@/components/MomentDetailView'

interface Props {
  params: Promise<{ address: string; tokenId: string }>
}

async function fetchDetail(address: string, tokenId: string) {
  try {
    const url = new URL(`${INPROCESS_API}/moment`)
    url.searchParams.set('collectionAddress', address)
    url.searchParams.set('tokenId', tokenId)
    url.searchParams.set('chainId', '8453')
    const res = await fetch(url.toString(), { next: { revalidate: 3600 } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address, tokenId } = await params
  const detail = await fetchDetail(address, tokenId)
  if (!detail) return { title: 'Moment — Kismet Art' }

  const meta = detail.metadata ?? {}
  const title = `${meta.name ?? `#${tokenId}`} — Kismet Art`
  const description = meta.description ?? 'View this moment on Kismet Art'
  const imageUrl = meta.image ? resolveUri(meta.image) : undefined

  return {
    title,
    description,
    openGraph: {
      title: meta.name ?? `#${tokenId}`,
      description,
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
  }
}

export default async function MomentPage({ params }: Props) {
  const { address, tokenId } = await params
  return <MomentDetailView address={address} tokenId={tokenId} />
}
