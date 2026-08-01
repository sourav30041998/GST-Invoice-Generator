/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Cormorant Garamond", "Georgia", "serif"],
        sans: ["Jost", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        soft: "0 2px 20px rgba(0,0,0,.08)"
      }
    }
  },
  plugins: []
};
