/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'], // Example font
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [
    require('tailwindcss-animate') // Optional utility
  ],
}