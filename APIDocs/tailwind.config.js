/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        'itm-primary': '#17335c',
        'itm-primary-light': '#1e4175',
        'itm-primary-dark': '#0f2340',
      },
    },
  },
  plugins: [],
}
