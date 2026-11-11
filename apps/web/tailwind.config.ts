import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050505',
        coal: { DEFAULT: '#141414', light: '#1E1E1E', line: '#2A2A2A' },
        gold: { DEFAULT: '#D7AE55', soft: '#E8C97F', deep: '#A8842F' },
        muted: '#A3A3A3',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(215,174,85,0.45)',
        'glow-lg': '0 0 80px -12px rgba(215,174,85,0.55)',
        lift: '0 18px 40px -18px rgba(0,0,0,0.9)',
      },
      keyframes: {
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.92)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        eq: { '0%,100%': { transform: 'scaleY(0.3)' }, '50%': { transform: 'scaleY(1)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        float: { '0%,100%': { transform: 'translate3d(0,0,0) scale(1)' }, '50%': { transform: 'translate3d(0,-18px,0) scale(1.06)' } },
        drift: {
          '0%': { transform: 'translate3d(0,0,0) scale(1)' },
          '33%': { transform: 'translate3d(6%,-8%,0) scale(1.12)' },
          '66%': { transform: 'translate3d(-5%,6%,0) scale(0.95)' },
          '100%': { transform: 'translate3d(0,0,0) scale(1)' },
        },
        'gold-shift': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        'pulse-ring': { '0%': { boxShadow: '0 0 0 0 rgba(215,174,85,0.55)' }, '100%': { boxShadow: '0 0 0 18px rgba(215,174,85,0)' } },
        breathe: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.025)' } },
      },
      animation: {
        'slide-up': 'slide-up 0.32s cubic-bezier(0.2,0.8,0.2,1)',
        'fade-in': 'fade-in 0.25s ease-out',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.2,0.8,0.2,1) both',
        'pop-in': 'pop-in 0.25s cubic-bezier(0.2,0.8,0.2,1) both',
        eq: 'eq 0.9s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        float: 'float 7s ease-in-out infinite',
        drift: 'drift 16s ease-in-out infinite',
        'gold-shift': 'gold-shift 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(0.2,0.8,0.2,1) infinite',
        breathe: 'breathe 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
