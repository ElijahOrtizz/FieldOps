/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#dbeeff',
          200: '#bddeff',
          300: '#8ecbff',
          400: '#59aaff',
          500: '#3388ff',
          600: '#1a6af5',
          700: '#1454e1',
          800: '#1744b6',
          900: '#183c8f',
          950: '#132657',
        },
        slate: {
          850: '#1a2234',
          925: '#0f1624',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
