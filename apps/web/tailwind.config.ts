import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      screens: {
        // phones in landscape and small tablets get the tablet layout from 768 px (md)
        xs: '420px',
      },
      colors: {
        ink: '#07060B',
        coal: { DEFAULT: '#12111A', light: '#1B1A26', line: '#2B2938' },
        // brand saffron-gold (name kept so every screen picks up the new shade)
        gold: { DEFAULT: '#F6B73C', soft: '#FFD580', deep: '#D68A1C' },
        rose: { DEFAULT: '#FF4F8B', soft: '#FF8DB2' },
        muted: '#A7A3B8',
        /** The colour of the song that is playing (falls back to gold). See globals.css. */
        dyn: 'rgb(var(--dyn-r) var(--dyn-g) var(--dyn-b) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 10px 40px -12px rgb(var(--dyn-r) var(--dyn-g) var(--dyn-b) / 0.55)',
        'glow-lg': '0 30px 90px -20px rgb(var(--dyn-r) var(--dyn-g) var(--dyn-b) / 0.65)',
        lift: '0 22px 50px -24px rgba(0,0,0,0.95)',
        dock: '0 -1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -20px rgba(0,0,0,0.9)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'pop-in': { '0%': { opacity: '0', transform: 'scale(0.94)' }, '100%': { opacity: '1', transform: 'scale(1)' } },
        eq: { '0%,100%': { transform: 'scaleY(0.3)' }, '50%': { transform: 'scaleY(1)' } },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } },
        'pulse-ring': { '0%': { boxShadow: '0 0 0 0 rgb(var(--dyn-r) var(--dyn-g) var(--dyn-b) / 0.5)' }, '100%': { boxShadow: '0 0 0 16px rgb(var(--dyn-r) var(--dyn-g) var(--dyn-b) / 0)' } },
        breathe: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.02)' } },
        spin: { to: { transform: 'rotate(360deg)' } },
        float: { '0%,100%': { transform: 'translate3d(0,0,0)' }, '50%': { transform: 'translate3d(0,-12px,0)' } },
      },
      animation: {
        'slide-up': 'slide-up 0.34s cubic-bezier(0.2,0.8,0.2,1)',
        'fade-in': 'fade-in 0.2s ease-out',
        'fade-up': 'fade-up 0.32s cubic-bezier(0.2,0.8,0.2,1) both',
        'pop-in': 'pop-in 0.22s cubic-bezier(0.2,0.8,0.2,1) both',
        eq: 'eq 0.9s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.2,0.8,0.2,1) infinite',
        breathe: 'breathe 5s ease-in-out infinite',
        'spin-slow': 'spin 14s linear infinite',
        float: 'float 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
