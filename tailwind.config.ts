import type { Config } from 'tailwindcss'

// Semantic design tokens — use these instead of `[#hex]` colors.
// ESLint rule in eslint.config.mjs blocks reintroduction of the hex literals.
const config: Config = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      colors: {
        surface: '#111',
        raised: '#1a1a1a',
        line: '#2a2a2a',
        ink: '#efefef',
        dim: '#888',
        muted: '#555',
        faint: '#333',
        accent: '#6B3FA0',
      },
    },
  },
  plugins: [],
}

export default config
