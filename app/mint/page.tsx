import { MintTabs } from '@/components/MintTabs'

export const metadata = {
  title: 'mint — Kismet Art',
  description: 'mint moments and create collections on Kismet Art',
}

export default function MintPage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-12">
      <MintTabs />
    </div>
  )
}
