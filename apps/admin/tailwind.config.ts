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
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Noto Sans', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -10px rgba(215,174,85,0.45)',
      },
      keyframes: {
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        eq: { '0%,100%': { transform: 'scaleY(0.35)' }, '50%': { transform: 'scaleY(1)' } },
      },
      animation: {
        'slide-up': 'slide-up 0.28s cubic-bezier(0.2,0.8,0.2,1)',
        'fade-in': 'fade-in 0.25s ease-out',
        eq: 'eq 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
