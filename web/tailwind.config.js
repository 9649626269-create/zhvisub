/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        app: {
          bg: '#F3F0E8',
          card: '#FBF8F1',
          border: '#DDD8CC',
          darkBg: '#0F1A17',
          darkCard: '#17241F',
          darkBorder: '#24362E',
        },
        primary: {
          DEFAULT: '#0F8A6F',
          hover: '#0B6B57',
          light: '#16A085',
        },
        mint: {
          DEFAULT: '#BFF3E4',
          text: '#0B6B57',
          hover: '#A6EDD9',
        },
        surface: {
          text: '#1B1B18',
          subtext: '#6B6B63',
          darkText: '#F5F5F0',
          darkSubtext: '#9E9E96',
        },
        state: {
          errorBg: '#F6DADA',
          errorText: '#B3261E',
          successBg: '#D1F5EA',
          successText: '#0B6B57',
        },
      },
      borderRadius: {
        'card': '28px',
        'input': '16px',
        'pill': '9999px',
      },
      fontFamily: {
        sans: ['Roboto', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        condensed: ['"Roboto Condensed"', 'Roboto', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
