import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './ui/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        graphite: { 950: '#080b0d', 900: '#0d1215', 800: '#151b1f', 700: '#20282d' },
        signal: { lime: '#b8ff5a', cyan: '#5ce1e6', amber: '#ffca6a', rose: '#ff7d96' }
      },
      boxShadow: { signal: '0 0 0 1px rgba(184,255,90,.14), 0 18px 50px rgba(0,0,0,.24)' }
    }
  },
  plugins: []
};

export default config;
