/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./static/**/*.html",
    "./static/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        health: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        medical: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Outfit', 'Inter', 'sans-serif']
      },
      boxShadow: {
        'health-sm': '0 1px 3px rgba(13, 148, 136, 0.05), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'health': '0 4px 20px -2px rgba(13, 148, 136, 0.08), 0 2px 6px -1px rgba(0, 0, 0, 0.04)',
        'health-lg': '0 10px 30px -4px rgba(13, 148, 136, 0.12), 0 4px 12px -2px rgba(0, 0, 0, 0.04)',
      }
    },
  },
  plugins: [],
}
