/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0a0a0f',
          800: '#111118',
          700: '#18181f',
          600: '#1e1e28',
          500: '#25252f',
          400: '#2e2e3a',
          300: '#3a3a48',
        },
        accent: {
          DEFAULT: '#6c63ff',
          hover: '#7c74ff',
          muted: '#3d3880',
        },
        muted: '#6b7280',
        subtle: '#4b5563',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
