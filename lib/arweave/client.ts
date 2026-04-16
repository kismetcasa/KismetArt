import { TurboFactory } from '@ardrive/turbo-sdk/web'

type TurboAuthenticatedClient = ReturnType<typeof TurboFactory.authenticated>

let _client: TurboAuthenticatedClient | null = null

export function getTurboClient(): TurboAuthenticatedClient {
  if (_client) return _client

  const key = process.env.NEXT_PUBLIC_ARWEAVE_KEY
  if (!key) throw new Error('NEXT_PUBLIC_ARWEAVE_KEY is not configured')

  const jwk = JSON.parse(Buffer.from(key, 'base64').toString())
  _client = TurboFactory.authenticated({ privateKey: jwk })
  return _client
}
