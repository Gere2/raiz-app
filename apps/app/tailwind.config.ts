import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#faf7f2",
          100: "#f3ede2",
          200: "#e6d9c3",
          300: "#d4be9b",
          400: "#c2a274",
          500: "#b58d57",
          600: "#a77a4b",
          700: "#8b6240",
          800: "#71503a",
          900: "#5d4332",
          950: "#312219",
        },
        leaf: {
          50:  "#f3f8f3",
          100: "#e3f0e3",
          200: "#c8e0c9",
          300: "#9fc8a1",
          400: "#70a973",
          500: "#4d8d50",
          600: "#3b723e",
          700: "#315b33",
          800: "#2a4a2c",
          900: "#243d26",
          950: "#102113",
        },
        cream: {
          50:  "#fefdfb",
          100: "#fdf9f0",
          200: "#faf2de",
          300: "#f5e6c4",
          400: "#eed5a1",
          500: "#e5c07c",
          600: "#d9a55a",
          700: "#c08843",
          800: "#9c6e3a",
          900: "#7f5b33",
          950: "#452f19",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
