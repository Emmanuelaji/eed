/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#006B3F', dark: '#004D2B' },
        secondary: '#138A52',
        mint: '#E8F5EC',
        background: '#F7FAF8',
        text: { main: '#172B22', secondary: '#64746B' },
        border: '#DCE8DF',
        success: '#15803D',
        warning: '#D97706',
        error: '#DC2626',
      },
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(23,43,34,.06), 0 4px 12px rgba(23,43,34,.04)' },
    },
  },
  plugins: [],
}
