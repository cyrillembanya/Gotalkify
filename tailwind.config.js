/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,jsx,mdx}",
    "./components/**/*.{js,jsx,mdx}",
    "./app/**/*.{js,jsx,mdx}",
    "./content/**/*.mdx",
  ],
  theme: {
    extend: {
      colors: {
        // Primary: deep navy (buttons, headings, footer)
        brand: {
          50: "#F0F4F9",
          100: "#DAE4EF",
          200: "#B6C8DC",
          300: "#7E9BBD",
          400: "#4A6B94",
          500: "#2A4A73",
          600: "#16304F",
          700: "#10233C",
          800: "#0C1B2E",
          900: "#091524",
        },
        // Accent: sky blue ("Book a Class" style buttons, footer links)
        accent: {
          100: "#D8EDFA",
          200: "#B7DFF5",
          300: "#96D0F0",
          400: "#6FBCE8",
          500: "#4FA8DD",
          600: "#3B8FC4",
        },
        // Neutrals: warm cream-tinted grays anchored on the navy ink
        slate: {
          50: "#F7F5F0",
          100: "#EFECE5",
          200: "#E2DFD7",
          300: "#CBC9C1",
          400: "#9CA3AD",
          500: "#6B7686",
          600: "#4C5A6E",
          700: "#35455C",
          800: "#22344C",
          900: "#14263F",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(20, 38, 63, 0.06), 0 4px 14px rgba(20, 38, 63, 0.05)",
      },
    },
  },
  plugins: [],
};
