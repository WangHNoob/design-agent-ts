import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F7F5F0',
        ink: '#1A1A2E',
        coral: '#E85D4C',
        indigo: '#4A6FA5',
        success: '#2D8A5E',
        warning: '#D4A03A',
        surface: '#FFFFFF',
        'surface-warm': '#FAF8F3',
      },
      fontFamily: {
        display: ['var(--font-lxgw)', 'serif'],
        body: ['var(--font-noto)', 'sans-serif'],
      },
      boxShadow: {
        'warm': '0 4px 24px -4px rgba(26, 26, 46, 0.08)',
        'warm-lg': '0 8px 40px -4px rgba(26, 26, 46, 0.12)',
        'glow-coral': '0 0 20px rgba(232, 93, 76, 0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
export default config
