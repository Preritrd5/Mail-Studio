/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#172E58',
          blue: '#1456AD',
          gold: '#C69A4C',
          lightGrey: '#F4F6FA',
          white: '#FFFFFF',
          text: '#1E293B',
          muted: '#64748B',
          border: '#CBD5E1',
        },
        primary: {
          DEFAULT: '#1456AD',
          hover: '#0E448D',
          light: '#EBF3FC',
        },
        navy: {
          DEFAULT: '#172E58',
          dark: '#0F1F3D',
          light: '#1F3C73',
        },
        gold: {
          DEFAULT: '#C69A4C',
          light: '#F7F1E5',
          hover: '#B0853B',
        },
        surface: {
          bg: '#F4F6FA',
          card: '#FFFFFF',
          border: '#CBD5E1',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        'card': '12px',
        'subtle': '10px',
        'badge': '8px',
      },
      boxShadow: {
        'subtle': '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        'card': '0 2px 6px 0 rgba(23, 46, 88, 0.05), 0 1px 2px 0 rgba(23, 46, 88, 0.02)',
        'elevation': '0 10px 25px -5px rgba(23, 46, 88, 0.08), 0 8px 10px -6px rgba(23, 46, 88, 0.04)',
      }
    },
  },
  plugins: [],
}
