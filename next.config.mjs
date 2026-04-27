/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Turbo SDK as a Node.js external so it runs natively in /api/upload
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

  webpack: (config) => {
    // Optional deps that are not needed in any build target
    config.resolve.alias['pino-pretty'] = false
    config.resolve.alias['@react-native-async-storage/async-storage'] = false
    return config
  },
}

export default nextConfig
