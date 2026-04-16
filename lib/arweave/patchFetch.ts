let baseOriginalFetch: typeof globalThis.fetch | null = null
let patchCount = 0

const patchFetch = (): (() => void) => {
  if (patchCount === 0) {
    baseOriginalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.body instanceof ReadableStream) {
        const blob = await new Response(init.body).blob()
        const { duplex: _duplex, ...rest } = init as RequestInit & { duplex?: string }
        return baseOriginalFetch!(input, { ...rest, body: blob })
      }
      return baseOriginalFetch!(input, init)
    }
  }
  patchCount++

  let restored = false
  return () => {
    if (restored) return
    restored = true
    patchCount--
    if (patchCount === 0) {
      globalThis.fetch = baseOriginalFetch!
      baseOriginalFetch = null
    }
  }
}

export default patchFetch
