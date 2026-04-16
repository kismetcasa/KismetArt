import { createRequire } from 'module'

const require = createRequire(import.meta.url)

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent the Turbo SDK from being bundled server-side — client-only
  serverExternalPackages: ['@ardrive/turbo-sdk'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'arweave.net' },
      { protocol: 'https', hostname: '*.arweave.net' },
      { protocol: 'https', hostname: 'ipfs.io' },
      { protocol: 'https', hostname: '*.ipfs.io' },
      { protocol: 'https', hostname: 'ipfs.decentralized-content.com' },
    ],
  },

  // Turbopack aliases for dev server (Next.js 15.x)
  experimental: {
    turbo: {
      resolveAlias: {
        buffer: 'buffer/',
        crypto: 'crypto-browserify',
        stream: 'stream-browserify',
        process: 'process/browser',
      },
    },
  },

  // Webpack config for production builds
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Strip node: URI prefix so standard fallbacks can resolve the modules
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '')
        })
      )

      config.resolve.fallback = {
        ...config.resolve.fallback,
        buffer: require.resolve('buffer/'),
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        process: require.resolve('process/browser'),
      }
    }
    return config
  },
}

export default nextConfig
